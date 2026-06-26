import { db } from '@/lib/db'

export async function listDeadLettered() {
  return db.webhookEvent.findMany({
    where: { status: 'dead_letter' },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
}

export async function markReplayed(id: string): Promise<void> {
  await db.webhookEvent.update({
    where: { id },
    data: { status: 'replayed', processedAt: new Date() },
  })
}

export async function markFailed(id: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  await db.webhookEvent.update({
    where: { id },
    data: {
      lastError: message.slice(0, 500),
      attempts: { increment: 1 },
    },
  })
}
