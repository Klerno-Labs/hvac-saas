import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'

const mocks = vi.hoisted(() => ({ access: vi.fn(), stripe: vi.fn(), create: vi.fn(), retrieve: vi.fn(), capture: vi.fn() }))
vi.mock('@/lib/mutation-access', () => ({ requireMutationAccess: mocks.access, jobAccessWhere: (ctx: { organizationId: string }) => ({ organizationId: ctx.organizationId }) }))
vi.mock('@/lib/stripe', () => ({ getStripe: mocks.stripe }))
if (!process.env.TEST_DATABASE_URL) throw new Error('Dedicated TEST_DATABASE_URL required')
const database = new URL(process.env.TEST_DATABASE_URL)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || !database.pathname.endsWith('_test')) throw new Error('Disposable loopback test database required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { createTerminalPaymentIntent, captureTerminalPayment } = await import('@/app/jobs/[jobId]/terminal-payment-actions')
const orgs: string[] = []
type ProviderIntent = Pick<Stripe.PaymentIntent, 'id' | 'client_secret' | 'amount' | 'currency' | 'metadata' | 'status' | 'capture_method' | 'payment_method_types' | 'amount_capturable' | 'amount_received'>
const intents = new Map<string, ProviderIntent>()

async function fixture() {
  const org = await db.organization.create({ data: { name: `Terminal fixture ${randomUUID()}`, subscriptionStatus: 'ACTIVE', stripeConnectedAccountId: `acct_${randomUUID()}`, stripeChargesEnabled: true, stripeTerminalEnabled: true } })
  orgs.push(org.id)
  const customer = await db.customer.create({ data: { organizationId: org.id, firstName: 'Internal fixture' } })
  const job = await db.job.create({ data: { organizationId: org.id, customerId: customer.id, title: 'Terminal test' } })
  const invoice = await db.invoice.create({ data: { organizationId: org.id, customerId: customer.id, jobId: job.id, invoiceNumber: 'INV-TEST', status: 'sent', subtotalCents: 5000, taxCents: 0, totalCents: 5000, outstandingCents: 5000 } })
  mocks.access.mockResolvedValue({ authorized: true, context: { userId: 'fixture_user', organizationId: org.id, role: 'owner' } })
  return { org, invoice }
}
beforeEach(() => {
  vi.clearAllMocks(); intents.clear()
  mocks.stripe.mockReturnValue({ paymentIntents: { create: mocks.create, retrieve: mocks.retrieve, capture: mocks.capture } })
  mocks.create.mockImplementation(async (input: Stripe.PaymentIntentCreateParams) => {
    const id = `pi_${randomUUID()}`
    const intent: ProviderIntent = { id, client_secret: `${id}_secret_fixture`, amount: input.amount, currency: 'usd', metadata: input.metadata as Record<string, string>, status: 'requires_payment_method', capture_method: 'manual', payment_method_types: ['card_present'], amount_capturable: 5000, amount_received: 0 }
    intents.set(id, intent); return intent
  })
  mocks.retrieve.mockImplementation(async (id: string) => intents.get(id))
  mocks.capture.mockImplementation(async (id: string) => {
    const intent = intents.get(id)!
    const result: ProviderIntent = { ...intent, status: 'succeeded', amount_received: intent.amount, amount_capturable: 0 }
    intents.set(id, result); return result
  })
})
afterAll(async () => { await db.organization.deleteMany({ where: { id: { in: orgs } } }); await db.$disconnect() })

describe('Terminal payment safety against PostgreSQL with simulated Stripe', () => {
  it('serializes simultaneous creation into one provider intent and one durable pending payment', async () => {
    const { org, invoice } = await fixture()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const originalCreate = mocks.create.getMockImplementation()!
    mocks.create.mockImplementationOnce(async (...args) => { await gate; return originalCreate(...args) })
    const first = createTerminalPaymentIntent(invoice.id)
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    const second = await createTerminalPaymentIntent(invoice.id)
    expect(second.success).toBe(false)
    release()
    const result = await first; expect(result.success).toBe(true)
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(await db.payment.count({ where: { organizationId: org.id, invoiceId: invoice.id, method: 'terminal', status: 'pending' } })).toBe(1)
    expect(await db.activityEvent.count({ where: { organizationId: org.id, eventName: 'invoice_payment_attempt' } })).toBe(1)
  })
  it('recovers a lost capture response without charging again and leaves paid state exclusively for the webhook', async () => {
    const { invoice } = await fixture()
    const created = await createTerminalPaymentIntent(invoice.id); expect(created.success).toBe(true)
    if (!created.success) throw new Error('Fixture intent missing')
    const intent = intents.get(created.paymentIntentId)!
    intents.set(intent.id, { ...intent, status: 'requires_capture' })
    mocks.capture.mockImplementationOnce(async (id: string) => {
      const current = intents.get(id)!
      intents.set(id, { ...current, status: 'succeeded', amount_received: current.amount, amount_capturable: 0 })
      throw new Error('Simulated network loss after accepted capture')
    })
    expect((await captureTerminalPayment(intent.id)).success).toBe(false)
    expect((await createTerminalPaymentIntent(invoice.id)).success).toBe(false)
    expect((await captureTerminalPayment(intent.id)).success).toBe(true)
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.capture).toHaveBeenCalledTimes(1)
    expect(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: 'sent', outstandingCents: 5000, paidAt: null })
    expect(await db.payment.findUniqueOrThrow({ where: { stripePaymentIntent: intent.id } })).toMatchObject({ status: 'pending', paidAt: null })
  })
  it('refuses a stale authorization once the invoice balance has become zero', async () => {
    const { invoice } = await fixture()
    const created = await createTerminalPaymentIntent(invoice.id)
    if (!created.success) throw new Error('Fixture intent missing')
    const intent = intents.get(created.paymentIntentId)!
    intents.set(intent.id, { ...intent, status: 'requires_capture' })
    await db.invoice.update({ where: { id: invoice.id }, data: { outstandingCents: 0 } })
    expect((await captureTerminalPayment(intent.id)).success).toBe(false)
    expect(mocks.capture).not.toHaveBeenCalled()
  })
})
