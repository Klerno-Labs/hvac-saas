import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/require-admin')
vi.mock('@/lib/stripe')
vi.mock('@/lib/webhook-store')
vi.mock('@/lib/db', () => ({
  db: {
    webhookEvent: {
      findUnique: vi.fn(),
    },
  },
}))
vi.mock('@/app/api/stripe/webhook/route', () => ({
  dispatchEvent: vi.fn(),
  POST: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import type { Mock } from 'vitest'
import { requireAdmin } from '@/lib/require-admin'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { markReplayed, markFailed } from '@/lib/webhook-store'
import { dispatchEvent } from '@/app/api/stripe/webhook/route'
import { replayWebhookEvent } from '@/app/settings/webhooks/actions'

const mockRequireAdmin = requireAdmin as Mock
const mockGetStripe = getStripe as Mock
const mockMarkReplayed = markReplayed as Mock
const mockMarkFailed = markFailed as Mock
const mockDispatchEvent = dispatchEvent as Mock
const mockFindUnique = db.webhookEvent.findUnique as Mock

const deadLetterRow = {
  id: 'row_1',
  stripeEventId: 'evt_stripe_1',
  type: 'checkout.session.completed',
  status: 'dead_letter',
  orgId: 'org_1',
  attempts: 2,
  lastError: 'Connection timeout',
  receivedAt: new Date(),
  updatedAt: new Date(),
  processedAt: null,
  metadata: null,
}

function makeFormData(webhookEventId: string): FormData {
  const fd = new FormData()
  fd.append('webhookEventId', webhookEventId)
  return fd
}

describe('replayWebhookEvent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('does nothing when requireAdmin returns unauthorized', async () => {
    mockRequireAdmin.mockResolvedValue({ authorized: false, error: 'Not owner' })

    await replayWebhookEvent(makeFormData('row_1'))

    expect(mockGetStripe).not.toHaveBeenCalled()
    expect(mockDispatchEvent).not.toHaveBeenCalled()
    expect(mockMarkReplayed).not.toHaveBeenCalled()
  })

  it('fetches live event from Stripe, calls dispatchEvent, and marks replayed on success', async () => {
    mockRequireAdmin.mockResolvedValue({
      authorized: true,
      context: { userId: 'u1', organizationId: 'org_1', role: 'owner', userEmail: null },
    })
    mockFindUnique.mockResolvedValue(deadLetterRow)

    const fakeEvent = { id: 'evt_stripe_1', type: 'checkout.session.completed' }
    const mockEventsRetrieve = vi.fn().mockResolvedValue(fakeEvent)
    mockGetStripe.mockReturnValue({ events: { retrieve: mockEventsRetrieve } })
    mockDispatchEvent.mockResolvedValue(undefined)
    mockMarkReplayed.mockResolvedValue(undefined)

    await replayWebhookEvent(makeFormData('row_1'))

    expect(mockEventsRetrieve).toHaveBeenCalledWith('evt_stripe_1')
    expect(mockDispatchEvent).toHaveBeenCalledWith(fakeEvent)
    expect(mockMarkReplayed).toHaveBeenCalledWith('row_1')
    expect(mockMarkFailed).not.toHaveBeenCalled()
  })

  it('calls markFailed instead of markReplayed when dispatchEvent throws', async () => {
    mockRequireAdmin.mockResolvedValue({
      authorized: true,
      context: { userId: 'u1', organizationId: 'org_1', role: 'owner', userEmail: null },
    })
    mockFindUnique.mockResolvedValue(deadLetterRow)

    const fakeEvent = { id: 'evt_stripe_1', type: 'checkout.session.completed' }
    const mockEventsRetrieve = vi.fn().mockResolvedValue(fakeEvent)
    mockGetStripe.mockReturnValue({ events: { retrieve: mockEventsRetrieve } })

    const dispatchError = new Error('Handler failed')
    mockDispatchEvent.mockRejectedValue(dispatchError)
    mockMarkFailed.mockResolvedValue(undefined)

    await replayWebhookEvent(makeFormData('row_1'))

    expect(mockMarkFailed).toHaveBeenCalledWith('row_1', dispatchError)
    expect(mockMarkReplayed).not.toHaveBeenCalled()
  })
})
