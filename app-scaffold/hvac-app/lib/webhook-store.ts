import { db } from '@/lib/db'

export async function listDeadLettered() {
  return db.webhookEvent.findMany({
    where: { status: 'dead_letter' },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
}

export async function markReplayed(id: string) {
  await db.webhookEvent.update({
    where: { id },
    data: { status: 'replayed', processedAt: new Date() },
  })
}

export async function markFailed(id: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  await db.webhookEvent.update({
    where: { id },
    data: {
      attempts: { increment: 1 },
      lastError: message.slice(0, 500),
      status: 'dead_letter',
    },
  })
}
