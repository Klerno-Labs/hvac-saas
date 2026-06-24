import { Prisma } from '@prisma/client'
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { dispatchStripeEvent } from '@/lib/stripe-webhook-handlers'

/**
 * Idempotent delivery + bounded-backoff retry + dead-letter for the Stripe
 * webhook.
 *
 * Lifecycle of a `StripeWebhookEvent` row:
 *
 *   received ─▶ pending ─▶ succeeded                       (happy path)
 *                  │
 *                  └▶ attemptDispatch throws
 *                       │  attempts < MAX_ATTEMPTS
 *                       └─▶ retry_scheduled ─▶ (scheduler) ─▶ succeeded
 *                                  │                │
 *                                  │                └─▶ throws (still) ─▶ …
 *                                  │
 *                                  └ attempts >= MAX_ATTEMPTS
 *                                     └─▶ dead_lettered ─▶ (operator replay) ─▶ retry_scheduled
 *
 * Retry scheduling is cron-poll driven (`processDueRetries`), NOT in-process
 * `setTimeout`, because Next.js serverless invocations do not persist long
 * enough to honour an in-process timer — which is precisely when retries
 * matter. Replays re-fetch the event from the Stripe API by id (Stripe retains
 * events for ~30 days, exceeding our retry window), so no raw payload is
 * stored at rest.
 */

export type WebhookStatus = 'pending' | 'succeeded' | 'retry_scheduled' | 'dead_lettered'
export type AttemptOutcome = WebhookStatus

/** Maximum handler dispatches per event (1 initial + 5 retries). */
export const MAX_ATTEMPTS = 6

export const BACKOFF_BASE_MS = 30_000 // 30s
const BACKOFF_FACTOR = 2
export const BACKOFF_CAP_MS = 60 * 60 * 1000 // 1h

/** Batch size per scheduler tick — bounded so one run can't monopolize a cron. */
const SCHEDULER_BATCH = 50

/**
 * Bounded exponential backoff for a given 1-based attempt number:
 * `BASE * 2^(attempt-1)`, capped at `BACKOFF_CAP_MS`.
 *
 *   attempt 1 → 30s, 2 → 60s, 3 → 2m, 4 → 4m, 5 → 8m, 6 → 16m, 7+ → 1h cap
 */
export function computeBackoffMs(attempt: number): number {
  if (attempt < 1) return BACKOFF_BASE_MS
  const raw = BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, attempt - 1)
  return Math.min(raw, BACKOFF_CAP_MS)
}

/** True once the attempt count has exhausted the configured retry budget. */
export function isExhausted(attempt: number): boolean {
  return attempt >= MAX_ATTEMPTS
}

const SECRET_PATTERNS = [
  /sk_(live|test)_[0-9a-zA-Z]{16,}/g,
  /whsec_[0-9a-zA-Z]{16,}/g,
  /rk_(live|test)_[0-9a-zA-Z]{16,}/g,
  /\b(?:password|secret|token|api[_-]?key)\b\s*[:=]\s*\S+/gi,
]

const MAX_ERROR_LEN = 2000

/**
 * Strip secret-shaped substrings from an error message before it is persisted
 * to `StripeWebhookEvent.lastError`. Mirrors the PII/secret hygiene of
 * `lib/audit.ts`. Stack traces are truncated to avoid storing large blobs.
 */
export function sanitizeError(message: string): string {
  let out = message
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, '[REDACTED]')
  }
  return out.length > MAX_ERROR_LEN ? out.slice(0, MAX_ERROR_LEN) + '…[truncated]' : out
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

type InboundRecord = { eventId: string; status: string }
export type InboundRecordResult =
  | { runHandler: true; record: InboundRecord }
  | { runHandler: false; record: InboundRecord | null }

/**
 * Idempotently record an inbound, signature-verified Stripe event.
 *
 * Returns `runHandler: true` ONLY the first time we see this `eventId`.
 * Concurrent / subsequent Stripe redeliveries collide on the unique
 * `eventId` primary key (Prisma `P2002`) and return `runHandler: false`, so
 * the handler is never invoked twice for the same event from the receive
 * path. Scheduled retries are driven separately by `processDueRetries`.
 */
export async function recordInboundEvent(
  eventId: string,
  eventType: string,
  payloadHash: string,
): Promise<InboundRecordResult> {
  try {
    const record = await db.stripeWebhookEvent.create({
      data: { eventId, eventType, payloadHash, status: 'pending' },
      select: { eventId: true, status: true },
    })
    return { runHandler: true, record }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await db.stripeWebhookEvent.findUnique({
        where: { eventId },
        select: { eventId: true, status: true },
      })
      return { runHandler: false, record: existing }
    }
    throw err
  }
}

/**
 * Atomically increment the attempt counter immediately before a dispatch.
 * Centralizing this here means the receive path and the scheduler share one
 * transition implementation.
 */
async function beginAttempt(eventId: string): Promise<number> {
  const row = await db.stripeWebhookEvent.update({
    where: { eventId },
    data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
    select: { attempts: true },
  })
  return row.attempts
}

/** Mark an event as fully handled. */
export async function markSucceeded(eventId: string): Promise<void> {
  await db.stripeWebhookEvent.update({
    where: { eventId },
    data: { status: 'succeeded', lastError: null, nextRetryAt: null },
  })
}

/**
 * Record a handler failure. If the retry budget is exhausted the event moves
 * to `dead_lettered`; otherwise it is scheduled for a bounded-backoff retry.
 * Returns the resulting status so callers can choose their HTTP response.
 */
export async function markFailed(
  eventId: string,
  attempt: number,
  error: unknown,
): Promise<AttemptOutcome> {
  const message = sanitizeError(errorToMessage(error))
  if (isExhausted(attempt)) {
    await db.stripeWebhookEvent.update({
      where: { eventId },
      data: { status: 'dead_lettered', lastError: message, nextRetryAt: null },
    })
    return 'dead_lettered'
  }
  const nextRetryAt = new Date(Date.now() + computeBackoffMs(attempt))
  await db.stripeWebhookEvent.update({
    where: { eventId },
    data: { status: 'retry_scheduled', lastError: message, nextRetryAt },
  })
  return 'retry_scheduled'
}

/**
 * Run one full dispatch attempt for an event we already have in memory:
 * increment the counter, dispatch, then transition to `succeeded` or
 * `retry_scheduled` / `dead_lettered`. Any handler error is captured here —
 * callers only need to inspect the returned outcome.
 */
export async function attemptDispatch(
  eventId: string,
  event: Stripe.Event,
): Promise<AttemptOutcome> {
  const attempt = await beginAttempt(eventId)
  try {
    await dispatchStripeEvent(event)
    await markSucceeded(eventId)
    return 'succeeded'
  } catch (err) {
    return markFailed(eventId, attempt, err)
  }
}

type SchedulerStats = {
  attempted: number
  succeeded: number
  rescheduled: number
  exhausted: number
}

/**
 * Cron-driven: re-attempt every `retry_scheduled` event whose backoff window
 * has elapsed. Re-fetches each event from Stripe by id before dispatching.
 * Bounded by `SCHEDULER_BATCH` per invocation so one run cannot monopolize a
 * cron tick.
 *
 * Each iteration performs exactly one attempt-counter increment, regardless of
 * which step (retrieval, dispatch, or mark) fails, so the retry budget is
 * consumed accurately. This intentionally does NOT call `attemptDispatch`
 * (which owns its own increment) to avoid double-counting.
 */
export async function processDueRetries(): Promise<SchedulerStats> {
  const due = await db.stripeWebhookEvent.findMany({
    where: { status: 'retry_scheduled', nextRetryAt: { lte: new Date() } },
    take: SCHEDULER_BATCH,
    orderBy: { nextRetryAt: 'asc' },
    select: { eventId: true },
  })

  const stats: SchedulerStats = { attempted: due.length, succeeded: 0, rescheduled: 0, exhausted: 0 }

  for (const { eventId } of due) {
    const attempt = await incrementAttemptSafe(eventId)
    let outcome: AttemptOutcome
    try {
      const event = await getStripe().events.retrieve(eventId)
      await dispatchStripeEvent(event)
      await markSucceeded(eventId)
      outcome = 'succeeded'
    } catch (err) {
      outcome = await markFailed(eventId, attempt, err)
    }
    if (outcome === 'succeeded') stats.succeeded++
    else if (outcome === 'dead_lettered') stats.exhausted++
    else stats.rescheduled++
  }

  return stats
}

/**
 * Operator-initiated replay of a dead-lettered event. Re-arms it with a fresh
 * retry budget (attempts reset to 0) so the next scheduler tick re-fetches
 * and re-dispatches. Returns a structured result for the admin UI.
 */
export async function replayDeadLetteredEvent(
  eventId: string,
): Promise<{ ok: boolean; reason?: 'not_found' | 'not_dead_lettered' }> {
  const row = await db.stripeWebhookEvent.findUnique({
    where: { eventId },
    select: { status: true },
  })
  if (!row) return { ok: false, reason: 'not_found' }
  if (row.status !== 'dead_lettered') return { ok: false, reason: 'not_dead_lettered' }

  await db.stripeWebhookEvent.update({
    where: { eventId },
    data: {
      status: 'retry_scheduled',
      attempts: 0,
      nextRetryAt: new Date(),
      lastError: null,
    },
  })
  return { ok: true }
}

async function incrementAttemptSafe(eventId: string): Promise<number> {
  const row = await db.stripeWebhookEvent.update({
    where: { eventId },
    data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
    select: { attempts: true },
  })
  return row.attempts
}
