import crypto from 'node:crypto'
import type { WebhookEvent } from '@prisma/client'
import { db } from '@/lib/db'

export const WEBHOOK_MAX_ATTEMPTS = 5
export const BACKOFF_BASE_SEC = 60
export const BACKOFF_MAX_SEC = 3600

const MAX_ERROR_LEN = 1000

export function hashPayload(body: string): string {
  return crypto.createHash('sha256').update(body).digest('hex')
}

type RecordInboundInput = {
  stripeEventId: string
  eventType: string
  payloadHash: string
  organizationId?: string | null
}

export async function recordInboundEvent(
  input: RecordInboundInput,
): Promise<{ event: WebhookEvent; alreadyProcessed: boolean }> {
  const event = await db.webhookEvent.upsert({
    where: { stripeEventId: input.stripeEventId },
    create: {
      stripeEventId: input.stripeEventId,
      type: input.eventType,
      payloadHash: input.payloadHash,
      orgId: input.organizationId ?? null,
      status: 'received',
      attempts: 0,
    },
    update: {},
  })

  const alreadyProcessed = event.status === 'processed' || event.status === 'replayed'
  return { event, alreadyProcessed }
}

export async function markProcessed(id: string): Promise<void> {
  await db.webhookEvent.update({
    where: { id },
    data: {
      status: 'processed',
      processedAt: new Date(),
      lastError: null,
      nextRetryAt: null,
    },
  })
}

function errorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  return msg.length > MAX_ERROR_LEN ? msg.slice(0, MAX_ERROR_LEN) : msg
}

export async function markFailed(
  id: string,
  error: unknown,
  opts?: { maxAttempts?: number },
): Promise<void> {
  const maxAttempts = opts?.maxAttempts ?? WEBHOOK_MAX_ATTEMPTS

  const current = await db.webhookEvent.findUnique({
    where: { id },
    select: { attempts: true },
  })
  const attempts = (current?.attempts ?? 0) + 1

  const dead = attempts >= maxAttempts
  const delaySec = Math.min(BACKOFF_BASE_SEC * 2 ** (attempts - 1), BACKOFF_MAX_SEC)
  const nextRetryAt = dead ? null : new Date(Date.now() + delaySec * 1000)

  await db.webhookEvent.update({
    where: { id },
    data: {
      status: dead ? 'dead_letter' : 'failed',
      attempts,
      lastError: errorMessage(error),
      nextRetryAt,
    },
  })
}

export async function dueForRetry(limit = 20): Promise<WebhookEvent[]> {
  return db.webhookEvent.findMany({
    where: { status: 'failed', nextRetryAt: { lte: new Date() } },
    orderBy: { nextRetryAt: 'asc' },
    take: limit,
  })
}

export async function listDeadLettered({ limit = 100 } = {}): Promise<WebhookEvent[]> {
  return db.webhookEvent.findMany({
    where: { status: 'dead_letter' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })
}

export async function markReplayed(id: string): Promise<void> {
  await db.webhookEvent.update({
    where: { id },
    data: {
      status: 'replayed',
      processedAt: new Date(),
      nextRetryAt: null,
    },
  })
}
