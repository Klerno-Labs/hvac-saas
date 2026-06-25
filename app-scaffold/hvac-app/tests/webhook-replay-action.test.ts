import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(),
}))

vi.mock('@/lib/webhook-store', () => ({
  markReplayed: vi.fn(),
  markFailed: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    webhookEvent: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/app/api/stripe/webhook/route', () => ({
  dispatchEvent: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireAdmin } from '@/lib/require-admin'
import { getStripe } from '@/lib/stripe'
import { markReplayed, markFailed } from '@/lib/webhook-store'
import { db } from '@/lib/db'
import { dispatchEvent } from '@/app/api/stripe/webhook/route'
import { replayWebhookEvent } from '@/app/settings/webhooks/actions'

const mockRequireAdmin = vi.mocked(requireAdmin)
const mockGetStripe = vi.mocked(getStripe)
const mockMarkReplayed = vi.mocked(markReplayed)
const mockMarkFailed = vi.mocked(markFailed)
const mockDispatchEvent = vi.mocked(dispatchEvent)
const mockFindUnique = vi.mocked(db.webhookEvent.findUnique)

const deadLetterRow = {
  id: 'wh_1',
  stripeEventId: 'evt_abc123',
  type: 'checkout.session.completed',
  status: 'dead_letter',
  orgId: 'org_1',
  attempts: 2,
  lastError: 'some error',
  receivedAt: new Date(),
  updatedAt: new Date(),
  processedAt: null,
  metadata: null,
}

const fakeStripeEvent = { id: 'evt_abc123', type: 'checkout.session.completed' }

const authorizedAdmin = {
  authorized: true as const,
  context: { userId: 'u1', userEmail: 'owner@test.com', organizationId: 'org_1', role: 'owner' },
}

function makeFormData(webhookEventId: string): FormData {
  const fd = new FormData()
  fd.append('webhookEventId', webhookEventId)
  return fd
}

describe('replayWebhookEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when requireAdmin returns unauthorized', async () => {
    mockRequireAdmin.mockResolvedValue({ authorized: false, error: 'forbidden' })

    await replayWebhookEvent(makeFormData('wh_1'))

    expect(mockGetStripe).not.toHaveBeenCalled()
    expect(mockDispatchEvent).not.toHaveBeenCalled()
    expect(mockMarkReplayed).not.toHaveBeenCalled()
  })

  it('fetches event from Stripe, dispatches it, and marks replayed on success', async () => {
    mockRequireAdmin.mockResolvedValue(authorizedAdmin)
    mockFindUnique.mockResolvedValue(deadLetterRow as never)
    const mockEventsRetrieve = vi.fn().mockResolvedValue(fakeStripeEvent)
    mockGetStripe.mockReturnValue({ events: { retrieve: mockEventsRetrieve } } as never)
    mockDispatchEvent.mockResolvedValue(undefined)

    await replayWebhookEvent(makeFormData('wh_1'))

    expect(mockEventsRetrieve).toHaveBeenCalledWith('evt_abc123')
    expect(mockDispatchEvent).toHaveBeenCalledWith(fakeStripeEvent)
    expect(mockMarkReplayed).toHaveBeenCalledWith('wh_1')
    expect(mockMarkFailed).not.toHaveBeenCalled()
  })

  it('calls markFailed when dispatchEvent throws', async () => {
    mockRequireAdmin.mockResolvedValue(authorizedAdmin)
    mockFindUnique.mockResolvedValue(deadLetterRow as never)
    const mockEventsRetrieve = vi.fn().mockResolvedValue(fakeStripeEvent)
    mockGetStripe.mockReturnValue({ events: { retrieve: mockEventsRetrieve } } as never)
    const dispatchError = new Error('handler failed')
    mockDispatchEvent.mockRejectedValue(dispatchError)

    await replayWebhookEvent(makeFormData('wh_1'))

    expect(mockMarkFailed).toHaveBeenCalledWith('wh_1', dispatchError)
    expect(mockMarkReplayed).not.toHaveBeenCalled()
  })
})
