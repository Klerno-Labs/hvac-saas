import { formatDateOnly, startOfBusinessDayAsUtcDate } from '@/lib/format'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { sendCollectionEmail } from '@/lib/email'
import { isTwilioConfigured, sendCollectionSms } from '@/lib/sms'
import { getOrCreatePortalUrl } from '@/lib/portal'
import { type CollectionStage } from '@/lib/validations/collections'
import { isSubscriptionActive, hasRequiredPlan } from '@/lib/billing'
import { COLLECTION_CLAIM_TIMEOUT_MS, COLLECTION_MAX_ATTEMPTS, collectionDeliveryStatus, collectionStageCanAdvance, readCollectionDelivery, type CollectionChannel, type CollectionDeliveryState } from '@/lib/collection-delivery'

const HOUR_MS = 60 * 60 * 1000
const terminalStatuses = ['sent', 'dismissed', 'skipped']

/** Claims commit before provider calls; each channel has its own durable outcome.
 * Unknown outcomes stop for review instead of risking an automatic duplicate.
 * Legacy attempts have no delivery evidence and are never silently resent.
 */
export async function runCollectionsAutomation(now = new Date()) {
  const result = { organizationsProcessed: 0, attemptsCreated: 0, attemptsSkipped: 0, channelsAccepted: 0, errors: 0, needsReview: 0 }
  const organizations = await db.organization.findMany({ where: { collectionsEnabled: true, readOnlyAt: null }, select: { id: true, subscriptionStatus: true, plan: true, trialEndsAt: true } })
  for (const org of organizations) {
    if (!isSubscriptionActive(org) || !hasRequiredPlan(org, 'pro')) continue
    result.organizationsProcessed++
    let afterId: string | undefined
    while (true) {
      const invoices = await db.invoice.findMany({
        where: { organizationId: org.id, status: { in: ['sent', 'overdue'] }, outstandingCents: { gt: 0 }, collectionsPaused: false, dueDate: { not: null }, customer: { deletedAt: null }, ...(afterId ? { id: { gt: afterId } } : {}) },
        select: { id: true }, orderBy: { id: 'asc' }, take: 500,
      })
      for (const invoice of invoices) {
        let stage: CollectionStage | undefined
        for (const channel of ['email', 'sms'] as const) {
          try {
            const claim = await claimChannel(org.id, invoice.id, channel, now, stage)
            if (!claim) { result.attemptsSkipped++; continue }
            stage = claim.stage
            if (claim.created) result.attemptsCreated++
            if (claim.needsReview) result.needsReview++
            if (!claim.send) continue
            const { attemptId, attemptNumber, customer, organization, document } = claim.send
            let outcome: { success: true; id?: string; sid?: string } | { success: false; retryable?: boolean }
            try {
              const params = {
                customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
                invoiceNumber: document.invoiceNumber, totalFormatted: '$' + (document.outstandingCents / 100).toFixed(2), orgName: organization.name, stage: claim.stage,
              }
              if (channel === 'email') {
                let portalUrl: string
                try { portalUrl = await getOrCreatePortalUrl(org.id, customer.id) }
                catch { outcome = { success: false, retryable: true }; await recordOutcome(attemptId, channel, attemptNumber, outcome, now); result.errors++; continue }
                outcome = await sendCollectionEmail({ ...params, to: customer.email!, portalUrl,
                  dueDate: formatDateOnly(document.dueDate!), idempotencyKey: `collection/${attemptId}/email/${attemptNumber}` })
              } else {
                outcome = await sendCollectionSms({ ...params, to: customer.phone! })
              }
            } catch { outcome = { success: false, retryable: false } }
            await recordOutcome(attemptId, channel, attemptNumber, outcome, now)
            if (outcome.success) result.channelsAccepted++
            else { result.errors++; if (!outcome.retryable || attemptNumber >= COLLECTION_MAX_ATTEMPTS) result.needsReview++ }
          } catch {
            console.error('Collection delivery could not be confirmed')
            result.errors++
          }
        }
      }
      if (invoices.length < 500) break
      afterId = invoices[invoices.length - 1].id
    }
  }
  return result
}

async function claimChannel(organizationId: string, invoiceId: string, channel: CollectionChannel, now: Date, selectedStage?: CollectionStage) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, organizationId }, include: { organization: true, customer: true, collectionAttempts: true } })
    if (!invoice || !['sent', 'overdue'].includes(invoice.status) || invoice.outstandingCents <= 0 || invoice.collectionsPaused || !invoice.dueDate ||
      invoice.customer.deletedAt || !invoice.organization.collectionsEnabled || invoice.organization.readOnlyAt || !isSubscriptionActive(invoice.organization) || !hasRequiredPlan(invoice.organization, 'pro')) return null
    const org = invoice.organization
    const daysPastDue = Math.floor((startOfBusinessDayAsUtcDate(now, org.timezone).getTime() - invoice.dueDate.getTime()) / (24 * HOUR_MS))
    const thresholds: Array<{ stage: CollectionStage; days: number }> = [
      { stage: 'overdue_1', days: org.collectionsOverdue1Days }, { stage: 'overdue_2', days: org.collectionsOverdue2Days }, { stage: 'final_notice', days: org.collectionsFinalDays },
    ]
    const stage = selectedStage ?? thresholds.find(item => daysPastDue >= item.days && !invoice.collectionAttempts.some(attempt => attempt.stage === item.stage && terminalStatuses.includes(attempt.status)))?.stage
    if (!stage || daysPastDue < thresholds.find(item => item.stage === stage)!.days) return null
    let attempt = invoice.collectionAttempts.find(item => item.stage === stage)
    if (attempt) {
      await tx.$queryRaw`SELECT id FROM "CollectionAttempt" WHERE id = ${attempt.id} FOR UPDATE`
      attempt = await tx.collectionAttempt.findUnique({ where: { id: attempt.id } }) ?? undefined
    }
    if (attempt && terminalStatuses.includes(attempt.status)) return { stage, created: false, needsReview: false, send: null }
    let created = false
    if (!attempt) {
      // Repeated or overlapping runs must not rush through all overdue stages.
      const previousStages = thresholds.slice(0, thresholds.findIndex(item => item.stage === stage)).map(item => item.stage)
      if (!collectionStageCanAdvance(invoice.collectionAttempts.filter(item => previousStages.includes(item.stage as CollectionStage)), now)) return null
      const initial: CollectionDeliveryState = { version: 1, email: { status: 'pending', attempts: 0 }, sms: { status: org.smsEnabled ? 'pending' : 'disabled', attempts: 0 } }
      attempt = await tx.collectionAttempt.create({ data: { organizationId, invoiceId, stage, status: 'retry', notes: JSON.stringify(initial) } })
      await trackEvent({ organizationId, eventName: 'collections_attempt_created', entityType: 'invoice', entityId: invoiceId, metadataJson: { stage, daysPastDue } }, tx)
      created = true
    }
    const state = readCollectionDelivery(attempt.notes)
    if (!state) {
      await tx.collectionAttempt.update({ where: { id: attempt.id }, data: { status: 'review' } })
      return { stage, created, needsReview: true, send: null }
    }
    const current = state[channel]
    const persist = () => tx.collectionAttempt.update({ where: { id: attempt.id }, data: { status: collectionDeliveryStatus(state), notes: JSON.stringify(state) } })
    if (current.status === 'sending' && (!current.attemptedAt || now.getTime() - Date.parse(current.attemptedAt) >= COLLECTION_CLAIM_TIMEOUT_MS)) {
      current.status = 'review'; await persist()
    }
    if (['accepted', 'disabled', 'sending', 'review'].includes(current.status)) return { stage, created, needsReview: current.status === 'review', send: null }
    if (current.nextRetryAt && Date.parse(current.nextRetryAt) > now.getTime()) return { stage, created, needsReview: false, send: null }
    if (channel === 'sms' && !org.smsEnabled) {
      current.status = 'disabled'; await persist(); return { stage, created, needsReview: false, send: null }
    }
    const available = channel === 'email' ? Boolean(invoice.customer.email && process.env.RESEND_API_KEY) : Boolean(invoice.customer.phone && isTwilioConfigured())
    if (!available) {
      current.status = 'blocked'; current.nextRetryAt = new Date(now.getTime() + HOUR_MS).toISOString(); await persist()
      return { stage, created, needsReview: false, send: null }
    }
    if (current.attempts >= COLLECTION_MAX_ATTEMPTS) {
      current.status = 'review'; await persist(); return { stage, created, needsReview: true, send: null }
    }
    current.status = 'sending'; current.attempts++; current.attemptedAt = now.toISOString(); delete current.nextRetryAt
    await persist()
    return { stage, created, needsReview: false, send: { attemptId: attempt.id, attemptNumber: current.attempts, customer: invoice.customer, organization: org, document: invoice } }
  })
}

async function recordOutcome(attemptId: string, channel: CollectionChannel, attemptNumber: number,
  outcome: { success: true; id?: string; sid?: string } | { success: false; retryable?: boolean }, now: Date) {
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "CollectionAttempt" WHERE id = ${attemptId} FOR UPDATE`
    const attempt = await tx.collectionAttempt.findUnique({ where: { id: attemptId } })
    const state = readCollectionDelivery(attempt?.notes ?? null)
    if (!attempt || !state || state[channel].status !== 'sending' || state[channel].attempts !== attemptNumber) return
    const current = state[channel]
    if (outcome.success) {
      current.status = 'accepted'; current.providerId = outcome.id ?? outcome.sid
      await trackEvent({ organizationId: attempt.organizationId, eventName: 'collection_channel_accepted', entityType: 'collection_attempt', entityId: attemptId, metadataJson: { channel, attemptNumber } }, tx)
    } else {
      current.status = outcome.retryable && attemptNumber < COLLECTION_MAX_ATTEMPTS ? 'retry' : 'review'
      if (current.status === 'retry') current.nextRetryAt = new Date(now.getTime() + Math.min(24, 2 ** (attemptNumber - 1)) * HOUR_MS).toISOString()
    }
    await tx.collectionAttempt.update({ where: { id: attemptId }, data: { status: terminalStatuses.includes(attempt.status) ? attempt.status : collectionDeliveryStatus(state), notes: JSON.stringify(state) } })
  })
}
