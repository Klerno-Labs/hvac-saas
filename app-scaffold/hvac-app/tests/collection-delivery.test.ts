import { describe, expect, it } from 'vitest'
import { collectionDeliveryStatus, collectionDeliverySummary, collectionStageCanAdvance, readCollectionDelivery, type CollectionDeliveryState } from '@/lib/collection-delivery'
const initial: CollectionDeliveryState = { version: 1, email: { status: 'pending', attempts: 0 }, sms: { status: 'disabled', attempts: 0 } }
describe('collection delivery evidence', () => {
  it.each([null, 'Legacy note', '{}', '{"version":2}', '{"version":1,"email":{"status":"accepted"}}'])('does not infer success from legacy or invalid state: %s', notes => {
    expect(readCollectionDelivery(notes)).toBeNull()
    expect(collectionDeliverySummary(notes)).toContain('outcome was not recorded')
  })
  it('requires every requested channel to be accepted before marking sent', () => {
    expect(collectionDeliveryStatus(initial)).toBe('retry')
    expect(collectionDeliveryStatus({ ...initial, email: { status: 'accepted', attempts: 1 } })).toBe('sent')
    expect(collectionDeliveryStatus({ version: 1, email: { status: 'accepted', attempts: 1 }, sms: { status: 'retry', attempts: 1 } })).toBe('partial')
    expect(collectionDeliveryStatus({ ...initial, email: { status: 'review', attempts: 1 } })).toBe('review')
  })
  it('renders human summaries without leaking raw metadata or provider identifiers', () => {
    const notes = JSON.stringify({ ...initial, email: { status: 'accepted', attempts: 1, providerId: 'private-provider-id' } })
    const summary = collectionDeliverySummary(notes)
    expect(summary).toContain('accepted by provider')
    expect(summary).not.toContain('private-provider-id')
    expect(summary).not.toContain('delivered')
  })
  it('shows stopped work without promising a retry while preserving accepted channel evidence', () => {
    const notes = JSON.stringify({ version: 1, email: { status: 'retry', attempts: 1 }, sms: { status: 'accepted', attempts: 1, providerId: 'private-provider-id' } })
    const summary = collectionDeliverySummary(notes, 'skipped')
    expect(summary).toContain('stopped after payment')
    expect(summary).toContain('SMS accepted by the provider')
    expect(summary).not.toContain('retry scheduled')
    expect(summary).not.toContain('private-provider-id')
  })
  it('waits a full day after the last actual channel submission before advancing the stage', () => {
    const previous = [{ createdAt: new Date('2026-09-01'), notes: JSON.stringify({ version: 1, email: { status: 'accepted', attempts: 2, attemptedAt: '2026-09-26T15:00:00Z' }, sms: { status: 'accepted', attempts: 1, attemptedAt: '2026-09-25T15:00:00Z' } }) }]
    expect(collectionStageCanAdvance(previous, new Date('2026-09-27T14:59:00Z'))).toBe(false)
    expect(collectionStageCanAdvance(previous, new Date('2026-09-27T15:00:00Z'))).toBe(true)
  })
})
