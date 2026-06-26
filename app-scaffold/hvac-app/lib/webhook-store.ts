import { db } from '@/lib/db'
import crypto from 'crypto'
import type { WebhookEvent } from '@prisma/client'

export const WEBHOOK_MAX_ATTEMPTS = 5
export const BACKOFF_BASE_SEC = 60
export const BACKOFF_MAX_SEC = 3600

export function hashPayload(body: string): string {
  return crypto.createHash('sha256').update(body).digest('hex')
}

export async function recordInboundEvent({
  stripeEventId,
  eventType,
  payloadHash,
  organizationId,
}: {
  stripeEventId: string
  eventType: string
  payloadHash: string
  organizationId?: string
}): Promise<{ event: WebhookEvent; alreadyProcessed: boolean }> {
  const event = await db.webhookEvent.upsert({
    where: { stripeEventId },
    create: {
      stripeEventId,
      type: eventType,
      payloadHash,
      orgId: organizationId,
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

export async function markFailed(
  id: string,
  error: unknown,
  opts?: { maxAttempts?: number }
): Promise<void> {
  const maxAttempts = opts?.maxAttempts ?? WEBHOOK_MAX_ATTEMPTS
  const { attempts: current } = await db.webhookEvent.findUniqueOrThrow({
    where: { id },
    select: { attempts: true },
  })
  const attempts = current + 1
  const errorMessage = error instanceof Error ? error.message : String(error)
  const lastError = errorMessage.slice(0, 1000)

  if (attempts >= maxAttempts) {
    await db.webhookEvent.update({
      where: { id },
      data: { attempts, status: 'dead_letter', lastError, nextRetryAt: null },
    })
  } else {
    const delaySec = Math.min(BACKOFF_BASE_SEC * 2 ** (attempts - 1), BACKOFF_MAX_SEC)
    await db.webhookEvent.update({
      where: { id },
      data: {
        attempts,
        status: 'failed',
        lastError,
        nextRetryAt: new Date(Date.now() + delaySec * 1000),
      },
    })
  }
}

export async function markReplayed(id: string): Promise<void> {
  await db.webhookEvent.update({
    where: { id },
    data: { status: 'replayed', processedAt: new Date(), nextRetryAt: null },
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
