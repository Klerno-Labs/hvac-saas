import { z } from 'zod'

const channelSchema = z.object({
  status: z.enum(['pending', 'sending', 'accepted', 'retry', 'blocked', 'review', 'disabled']),
  attempts: z.number().int().min(0).max(5),
  attemptedAt: z.string().datetime().optional(),
  nextRetryAt: z.string().datetime().optional(),
  providerId: z.string().max(200).optional(),
})
const stateSchema = z.object({ version: z.literal(1), email: channelSchema, sms: channelSchema })
export type CollectionDeliveryState = z.infer<typeof stateSchema>
export type CollectionChannel = 'email' | 'sms'
export const COLLECTION_MAX_ATTEMPTS = 5
export const COLLECTION_CLAIM_TIMEOUT_MS = 10 * 60 * 1000
export const COLLECTION_STAGE_GAP_MS = 24 * 60 * 60 * 1000

export function collectionStageCanAdvance(previous: Array<{ notes: string | null; createdAt: Date }>, now: Date): boolean {
  return previous.every(attempt => {
    const state = readCollectionDelivery(attempt.notes)
    const timestamps = state ? [state.email.attemptedAt, state.sms.attemptedAt].filter((value): value is string => Boolean(value)).map(Date.parse) : []
    const latest = timestamps.length ? Math.max(...timestamps) : attempt.createdAt.getTime()
    return now.getTime() - latest >= COLLECTION_STAGE_GAP_MS
  })
}

export function readCollectionDelivery(notes: string | null): CollectionDeliveryState | null {
  try {
    const result = stateSchema.safeParse(JSON.parse(notes || ''))
    return result.success ? result.data : null
  } catch { return null }
}

export function collectionDeliveryStatus(state: CollectionDeliveryState): string {
  const channels = [state.email, state.sms]
  if (channels.some(channel => channel.status === 'review')) return 'review'
  if (channels.some(channel => channel.status === 'sending')) return 'sending'
  if (channels.every(channel => channel.status === 'accepted' || channel.status === 'disabled')) return 'sent'
  if (channels.some(channel => channel.status === 'accepted')) return 'partial'
  return 'retry'
}

export function collectionDeliverySummary(notes: string | null, status?: string): string {
  const state = readCollectionDelivery(notes)
  if (status === 'skipped' || status === 'dismissed') {
    const accepted = state ? [state.email.status === 'accepted' ? 'Email' : '', state.sms.status === 'accepted' ? 'SMS' : ''].filter(Boolean) : []
    return `${status === 'skipped' ? 'Collection stopped after payment or invoice closure.' : 'This stage was dismissed.'} No further automatic submissions. ${accepted.length ? `${accepted.join(' and ')} accepted by the provider; the receipt is preserved.` : 'Earlier submission evidence is preserved; a request already in progress may still complete.'}`
  }
  if (!state) return 'Earlier attempt: delivery outcome was not recorded. Review provider records before retrying.'
  const labels: Record<CollectionDeliveryState['email']['status'], string> = {
    pending: 'queued', sending: 'submission in progress', accepted: 'accepted by provider', retry: 'retry scheduled',
    blocked: 'contact or delivery configuration needed', review: 'outcome needs review; automatic retry stopped', disabled: 'not enabled',
  }
  return `Email: ${labels[state.email.status]}. SMS: ${labels[state.sms.status]}.`
}
