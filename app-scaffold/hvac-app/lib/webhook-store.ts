import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export function hashPayload(body: string): string {
  return crypto.createHash('sha256').update(body).digest('hex')
}

export async function recordInboundEvent({
  stripeEventId,
  eventType,
  payloadHash,
}: {
  stripeEventId: string
  eventType: string
  payloadHash: string
}) {
  const existing = await db.webhookEvent.findUnique({
    where: { stripeEventId },
  })

  if (existing) {
    return { event: existing, alreadyProcessed: true }
  }

  const event = await db.webhookEvent.create({
    data: {
      stripeEventId,
      type: eventType,
      metadata: { payloadHash, status: 'pending', failureCount: 0 } as Prisma.InputJsonValue,
    },
  })

  return { event, alreadyProcessed: false }
}

export async function markProcessed(id: string): Promise<void> {
  await db.webhookEvent.update({
    where: { id },
    data: { processedAt: new Date() },
  })
}

export async function markFailed(id: string, error: unknown): Promise<void> {
  const existing = await db.webhookEvent.findUnique({ where: { id } })
  if (!existing) return

  const meta = (existing.metadata as Record<string, unknown>) ?? {}
  const failureCount = ((meta.failureCount as number) ?? 0) + 1
  const backoffMinutes = [1, 5, 30]
  const nextRetryAt =
    failureCount <= 3
      ? new Date(Date.now() + (backoffMinutes[failureCount - 1] ?? 30) * 60 * 1000)
      : null

  const updatedMeta = {
    ...meta,
    status: 'failed',
    failureCount,
    failureMessage: error instanceof Error ? error.message : String(error),
    nextRetryAt: nextRetryAt?.toISOString() ?? null,
  }

  await db.webhookEvent.update({
    where: { id },
    data: { metadata: updatedMeta as Prisma.InputJsonValue },
  })
}

export async function dueForRetry() {
  const events = await db.webhookEvent.findMany({
    where: { processedAt: null },
  })

  const now = new Date()
  return events.filter((e) => {
    const meta = (e.metadata as Record<string, unknown>) ?? {}
    if (meta.status !== 'failed') return false
    const failureCount = (meta.failureCount as number) ?? 0
    if (failureCount > 3) return false
    const nextRetryAt = meta.nextRetryAt ? new Date(meta.nextRetryAt as string) : null
    return nextRetryAt !== null && nextRetryAt <= now
  })
}
