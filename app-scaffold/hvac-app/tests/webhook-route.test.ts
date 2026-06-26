import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Stripe from 'stripe'

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (name: string) => (name === 'stripe-signature' ? 'test-sig' : null),
  }),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(),
}))

vi.mock('@/lib/webhook-store', () => ({
  hashPayload: vi.fn().mockReturnValue('test-hash'),
  recordInboundEvent: vi.fn(),
  markProcessed: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  dueForRetry: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/events', () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/db', () => ({
  db: {},
}))

vi.mock('@/lib/terminal', () => ({
  TERMINAL_PAYMENT_METHOD: 'terminal',
}))

import { POST } from '@/app/api/stripe/webhook/route'
import { getStripe } from '@/lib/stripe'
import { recordInboundEvent, markProcessed, markFailed } from '@/lib/webhook-store'
import { trackEvent } from '@/lib/events'

const mockEvent = {
  id: 'evt_123',
  type: 'account.updated',
  data: { object: { id: undefined } },
} as unknown as Stripe.Event

function makeRequest() {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body: 'raw-body',
  })
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'test-secret'

    vi.mocked(getStripe).mockReturnValue({
      webhooks: { constructEvent: vi.fn().mockReturnValue(mockEvent) },
    } as any)
  })

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET
  })

  it('records and processes a fresh event then marks it processed', async () => {
    vi.mocked(recordInboundEvent).mockResolvedValue({
      event: { id: 'db-id', stripeEventId: 'evt_123', metadata: null } as any,
      alreadyProcessed: false,
    })

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(recordInboundEvent).toHaveBeenCalledWith({
      stripeEventId: 'evt_123',
      eventType: 'account.updated',
      payloadHash: 'test-hash',
    })
    expect(markProcessed).toHaveBeenCalledWith('db-id')
    expect(body).toEqual({ received: true })
    expect(res.status).toBe(200)
  })

  it('short-circuits with duplicate:true when alreadyProcessed without running any handler', async () => {
    vi.mocked(recordInboundEvent).mockResolvedValue({
      event: { id: 'db-id', stripeEventId: 'evt_123', metadata: null } as any,
      alreadyProcessed: true,
    })

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(body).toEqual({ received: true, duplicate: true })
    expect(markProcessed).not.toHaveBeenCalled()
    expect(markFailed).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('calls markFailed and returns 500 when the try block throws', async () => {
    vi.mocked(recordInboundEvent).mockResolvedValue({
      event: { id: 'db-id', stripeEventId: 'evt_123', metadata: null } as any,
      alreadyProcessed: false,
    })
    vi.mocked(trackEvent).mockRejectedValue(new Error('processing error'))

    const res = await POST(makeRequest())

    expect(markFailed).toHaveBeenCalledWith('db-id', expect.any(Error))
    expect(markProcessed).not.toHaveBeenCalled()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Webhook processing failed' })
  })
})
