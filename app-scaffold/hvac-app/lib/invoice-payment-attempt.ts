import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export type InvoicePaymentInvoice = Prisma.InvoiceGetPayload<{ include: { organization: true; customer: true; job: true; lineItems: true } }>
export type InvoicePaymentAttempt = {
  id: string; invoiceId: string; organizationId: string; method: 'checkout' | 'terminal'
  connectedAccountId: string; amountCents: number; params: Prisma.JsonObject
  providerId: string | null; leaseToken: string; createdAt: Date
}
type StoredAttempt = {
  version: 1; active: boolean; method: 'checkout' | 'terminal'; connectedAccountId: string
  amountCents: number; params: Prisma.JsonObject; providerId: string | null; leaseToken: string; leaseUntil: number
}
const EVENT = 'invoice_payment_attempt'
const LEASE_MS = 30_000
const UNKNOWN_PROVIDER_MAX_AGE_MS = 23 * 60 * 60 * 1000
const pending = 'A payment is already being prepared or processed for this invoice. Please wait for confirmation before trying again.'

function read(value: Prisma.JsonValue | null): StoredAttempt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (v.version !== 1 || typeof v.active !== 'boolean' || !['checkout', 'terminal'].includes(String(v.method)) ||
      typeof v.connectedAccountId !== 'string' || !v.connectedAccountId || !Number.isSafeInteger(v.amountCents) || Number(v.amountCents) <= 0 ||
      !v.params || typeof v.params !== 'object' || Array.isArray(v.params) ||
      !(v.providerId === null || (typeof v.providerId === 'string' && v.providerId.length > 0)) ||
      typeof v.leaseToken !== 'string' || !Number.isFinite(v.leaseUntil)) return null
  return v as StoredAttempt
}
function eventWhere(invoiceId: string, organizationId: string) {
  return { organizationId, eventName: EVENT, entityType: 'invoice', entityId: invoiceId }
}
async function lock(tx: Prisma.TransactionClient, invoiceId: string, organizationId: string) {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`
}

/** Call inside the same invoice-row lock used for status changes. Unknown state blocks collection/voiding. */
export async function hasActiveInvoicePaymentAttempt(tx: Prisma.TransactionClient, invoiceId: string, organizationId: string) {
  const events = await tx.activityEvent.findMany({ where: eventWhere(invoiceId, organizationId), select: { metadataJson: true } })
  return events.some(event => read(event.metadataJson)?.active !== false)
}

export async function reserveInvoicePaymentAttempt(input: {
  invoiceId: string; organizationId: string; method: 'checkout' | 'terminal'
  invoiceWhere?: Prisma.InvoiceWhereInput
  /** Validated portal identity; permits settling an issued invoice in a read-only workspace. */
  customerPaymentCustomerId?: string
  buildParams: (invoice: InvoicePaymentInvoice) => unknown
}): Promise<{ success: true; attempt: InvoicePaymentAttempt; invoice: InvoicePaymentInvoice } | { success: false; error: string }> {
  try {
    return await db.$transaction(async tx => {
      await lock(tx, input.invoiceId, input.organizationId)
      const invoice = await tx.invoice.findFirst({
        where: { ...input.invoiceWhere, ...(input.customerPaymentCustomerId ? { customerId: input.customerPaymentCustomerId } : {}), id: input.invoiceId, organizationId: input.organizationId },
        include: { organization: true, customer: true, job: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
      })
      if (!invoice || invoice.customer.deletedAt || invoice.customer.organizationId !== input.organizationId || invoice.job.organizationId !== input.organizationId || invoice.job.customerId !== invoice.customerId) return { success: false, error: 'Invoice not found' }
      if (invoice.organization.readOnlyAt && !(input.method === 'checkout' && input.customerPaymentCustomerId === invoice.customerId)) return { success: false, error: 'This workspace is read-only. Ask the owner to review its subscription.' }
      if (!['sent', 'overdue'].includes(invoice.status) || !Number.isSafeInteger(invoice.outstandingCents) ||
          !Number.isSafeInteger(invoice.totalCents) || invoice.outstandingCents <= 0 || invoice.outstandingCents > invoice.totalCents) {
        return { success: false, error: 'This invoice does not have a payable balance.' }
      }
      const account = invoice.organization.stripeConnectedAccountId
      if (!account || !invoice.organization.stripeChargesEnabled || (input.method === 'terminal' && !invoice.organization.stripeTerminalEnabled)) return { success: false, error: 'This payment method is not available. Ask the owner to review payment setup.' }
      const events = await tx.activityEvent.findMany({ where: eventWhere(input.invoiceId, input.organizationId), orderBy: { createdAt: 'desc' } })
      if (events.some(event => !read(event.metadataJson))) return { success: false, error: 'The previous payment attempt needs review before another payment can start.' }
      const active = events.filter(event => read(event.metadataJson)!.active)
      if (active.length > 1) return { success: false, error: 'Multiple payment attempts need review before another payment can start.' }
      const now = Date.now(), leaseToken = randomUUID()
      if (active.length === 1) {
        const event = active[0], stored = read(event.metadataJson)!
        if (stored.method !== input.method || stored.leaseUntil > now) return { success: false, error: pending }
        if (stored.connectedAccountId !== account || stored.amountCents !== invoice.outstandingCents) return { success: false, error: 'The invoice or payment connection changed. The previous payment must be reviewed before another attempt.' }
        if (!stored.providerId && now - event.createdAt.getTime() >= UNKNOWN_PROVIDER_MAX_AGE_MS) return { success: false, error: 'The previous payment outcome is unknown. Contact support before starting another payment.' }
        const next = { ...stored, leaseToken, leaseUntil: now + LEASE_MS }
        await tx.activityEvent.update({ where: { id: event.id }, data: { metadataJson: next } })
        return { success: true, invoice, attempt: { id: event.id, invoiceId: invoice.id, organizationId: input.organizationId, method: stored.method,
          connectedAccountId: account, amountCents: stored.amountCents, params: stored.params, providerId: stored.providerId, leaseToken, createdAt: event.createdAt } }
      }
      // A previous integration may have created a charge without our durable
      // reservation. Never replace such an unknown pending payment blindly.
      if (await tx.payment.findFirst({ where: { invoiceId: invoice.id, organizationId: input.organizationId, status: 'pending' }, select: { id: true } })) return { success: false, error: 'An earlier payment is pending. Confirm its outcome before trying another payment.' }
      if (invoice.stripeCheckoutSessionId && input.method !== 'checkout') return { success: false, error: 'An online payment link already exists. Confirm or cancel that payment before collecting by card.' }
      const params = JSON.parse(JSON.stringify(input.buildParams(invoice))) as Prisma.JsonObject
      if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Invalid payment parameters')
      const stored: StoredAttempt = { version: 1, active: true, method: input.method, connectedAccountId: account, amountCents: invoice.outstandingCents,
        params, providerId: invoice.stripeCheckoutSessionId, leaseToken, leaseUntil: now + LEASE_MS }
      const event = await tx.activityEvent.create({ data: { ...eventWhere(invoice.id, input.organizationId), metadataJson: stored } })
      return { success: true, invoice, attempt: { id: event.id, invoiceId: invoice.id, organizationId: input.organizationId, method: input.method,
        connectedAccountId: account, amountCents: stored.amountCents, params, providerId: stored.providerId, leaseToken, createdAt: event.createdAt } }
    })
  } catch {
    return { success: false, error: 'Payment setup could not be confirmed. Please try again shortly.' }
  }
}

async function updateAttempt(attempt: InvoicePaymentAttempt, action: 'release' | 'retire' | 'save', providerId?: string, paymentIntentId?: string | null): Promise<boolean> {
  try {
    return await db.$transaction(async tx => {
      await lock(tx, attempt.invoiceId, attempt.organizationId)
      const event = await tx.activityEvent.findFirst({ where: { id: attempt.id, ...eventWhere(attempt.invoiceId, attempt.organizationId) } })
      const stored = event && read(event.metadataJson)
      if (!stored?.active || stored.leaseToken !== attempt.leaseToken || stored.method !== attempt.method || stored.connectedAccountId !== attempt.connectedAccountId) return false
      if (action === 'save') {
        if (!providerId || (stored.providerId && stored.providerId !== providerId)) return false
        const invoice = await tx.invoice.findFirst({ where: { id: attempt.invoiceId, organizationId: attempt.organizationId }, include: { organization: true, customer: true } })
        if (!invoice || invoice.customer.deletedAt || invoice.customer.organizationId !== attempt.organizationId || !['sent', 'overdue'].includes(invoice.status) || invoice.outstandingCents !== stored.amountCents || invoice.organization.stripeConnectedAccountId !== stored.connectedAccountId) return false
        if (stored.method === 'checkout') {
          if (invoice.stripeCheckoutSessionId && invoice.stripeCheckoutSessionId !== providerId) return false
          await tx.invoice.update({ where: { id: invoice.id }, data: { stripeCheckoutSessionId: providerId } })
        }
        const intentId = stored.method === 'terminal' ? providerId : paymentIntentId
        if (intentId) {
          const existing = await tx.payment.findUnique({ where: { stripePaymentIntent: intentId } })
          if (existing && (existing.organizationId !== attempt.organizationId || existing.invoiceId !== attempt.invoiceId || existing.amountCents !== stored.amountCents || existing.method !== stored.method)) throw new Error('Payment identity mismatch')
          if (!existing) await tx.payment.create({ data: { organizationId: attempt.organizationId, invoiceId: attempt.invoiceId,
            stripePaymentIntent: intentId, amountCents: stored.amountCents, currency: 'usd', method: stored.method, status: 'pending' } })
        }
      }
      if (action === 'retire') {
        if (!stored.providerId) return false
        if (stored.method === 'checkout') await tx.invoice.updateMany({ where: { id: attempt.invoiceId, organizationId: attempt.organizationId, stripeCheckoutSessionId: stored.providerId }, data: { stripeCheckoutSessionId: null } })
        // A Terminal ID is the intent. For Checkout, matching pending intents are
        // retired by the caller only when it supplies the verified session's PI.
        const intentId = stored.method === 'terminal' ? stored.providerId : paymentIntentId
        if (intentId) await tx.payment.updateMany({ where: { invoiceId: attempt.invoiceId, organizationId: attempt.organizationId, stripePaymentIntent: intentId, status: 'pending' }, data: { status: 'canceled' } })
      }
      await tx.activityEvent.update({ where: { id: event!.id }, data: { metadataJson: { ...stored, providerId: providerId ?? stored.providerId, active: action !== 'retire', leaseUntil: 0 } } })
      return true
    })
  } catch { return false }
}

export const saveInvoicePaymentProviderId = (attempt: InvoicePaymentAttempt, providerId: string, options: { paymentIntentId?: string | null } = {}) => updateAttempt(attempt, 'save', providerId, options.paymentIntentId)
export const releaseInvoicePaymentLease = (attempt: InvoicePaymentAttempt) => updateAttempt(attempt, 'release')
/** Caller must first verify provider terminal state under the exact connected account. */
export const retireInvoicePaymentAttempt = (attempt: InvoicePaymentAttempt, options: { paymentIntentId?: string | null } = {}) => updateAttempt(attempt, 'retire', undefined, options.paymentIntentId)

/** Claim an existing known payment for provider-confirmed cancellation. Never starts a payment. */
export async function claimInvoicePaymentAttemptForCancellation(input: {
  invoiceId: string; organizationId: string; method?: 'checkout' | 'terminal'; invoiceWhere?: Prisma.InvoiceWhereInput
}): Promise<
  { success: true; attempt: InvoicePaymentAttempt | null } | { success: false; error: string }
> {
  try {
    return await db.$transaction(async tx => {
      await lock(tx, input.invoiceId, input.organizationId)
      const invoice = await tx.invoice.findFirst({ where: { ...input.invoiceWhere, id: input.invoiceId, organizationId: input.organizationId }, include: { organization: { select: { stripeConnectedAccountId: true } } } })
      if (!invoice || !['sent', 'overdue'].includes(invoice.status)) return { success: false, error: 'Invoice cannot be canceled in its current state.' }
      const events = await tx.activityEvent.findMany({ where: eventWhere(input.invoiceId, input.organizationId) })
      if (events.some(event => !read(event.metadataJson))) return { success: false, error: 'The previous payment attempt needs review.' }
      const active = events.filter(event => read(event.metadataJson)!.active)
      if (active.length === 0) return { success: true, attempt: null }
      if (active.length !== 1) return { success: false, error: 'Multiple payment attempts need review.' }
      const event = active[0], stored = read(event.metadataJson)!
      if (stored.method !== (input.method ?? 'checkout') || !stored.providerId || stored.leaseUntil > Date.now()) return { success: false, error: pending }
      if (stored.method === 'terminal' && (stored.connectedAccountId !== invoice.organization.stripeConnectedAccountId || stored.amountCents !== invoice.outstandingCents)) return { success: false, error: 'The invoice or payment connection changed. The previous payment needs review.' }
      const leaseToken = randomUUID()
      await tx.activityEvent.update({ where: { id: event.id }, data: { metadataJson: { ...stored, leaseToken, leaseUntil: Date.now() + LEASE_MS } } })
      return { success: true, attempt: { id: event.id, invoiceId: input.invoiceId, organizationId: input.organizationId, method: stored.method,
        connectedAccountId: stored.connectedAccountId, amountCents: stored.amountCents, params: stored.params, providerId: stored.providerId, leaseToken, createdAt: event.createdAt } }
    })
  } catch { return { success: false, error: 'The previous payment could not be checked. Please try again shortly.' } }
}
