import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    webhookEvent: {
      upsert: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}))

import { db } from '@/lib/db'
import {
  hashPayload,
  recordInboundEvent,
  markFailed,
  WEBHOOK_MAX_ATTEMPTS,
  BACKOFF_BASE_SEC,
  BACKOFF_MAX_SEC,
} from '@/lib/webhook-store'

const wh = db.webhookEvent as unknown as {
  upsert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  findMany: ReturnType<typeof vi.fn>
  findUniqueOrThrow: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('hashPayload', () => {
  it('is deterministic and differs for different bodies', () => {
    const h1 = hashPayload('stripe-body-abc')
    const h2 = hashPayload('stripe-body-abc')
    const h3 = hashPayload('stripe-body-xyz')
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
    expect(h1).toHaveLength(64)
  })
})

describe('markFailed', () => {
  it('schedules nextRetryAt ~60s on attempt 1 and ~120s on attempt 2', async () => {
    wh.findUniqueOrThrow.mockResolvedValueOnce({ attempts: 0 })
    wh.update.mockResolvedValueOnce({})
    const t1 = Date.now()
    await markFailed('id1', new Error('oops'))
    const call1 = wh.update.mock.calls[0][0]
    expect(call1.data.status).toBe('failed')
    expect(call1.data.attempts).toBe(1)
    expect(call1.data.nextRetryAt.getTime()).toBeGreaterThanOrEqual(t1 + BACKOFF_BASE_SEC * 1000)
    expect(call1.data.nextRetryAt.getTime()).toBeLessThanOrEqual(t1 + BACKOFF_BASE_SEC * 1000 + 500)

    wh.findUniqueOrThrow.mockResolvedValueOnce({ attempts: 1 })
    wh.update.mockResolvedValueOnce({})
    const t2 = Date.now()
    await markFailed('id1', new Error('oops'))
    const call2 = wh.update.mock.calls[1][0]
    expect(call2.data.status).toBe('failed')
    expect(call2.data.attempts).toBe(2)
    expect(call2.data.nextRetryAt.getTime()).toBeGreaterThanOrEqual(t2 + BACKOFF_BASE_SEC * 2 * 1000)
    expect(call2.data.nextRetryAt.getTime()).toBeLessThanOrEqual(t2 + BACKOFF_BASE_SEC * 2 * 1000 + 500)
  })

  it('caps nextRetryAt at BACKOFF_MAX_SEC regardless of attempt count', async () => {
    // attempt 12: 60 * 2^(12-1) = 122880 > 3600 → should clamp to 3600
    // use maxAttempts:100 so we don't hit dead_letter before reaching high attempt counts
    wh.findUniqueOrThrow.mockResolvedValueOnce({ attempts: 11 })
    wh.update.mockResolvedValueOnce({})
    const t = Date.now()
    await markFailed('id1', new Error('oops'), { maxAttempts: 100 })
    const call = wh.update.mock.calls[0][0]
    expect(call.data.status).toBe('failed')
    const delayMs = call.data.nextRetryAt.getTime() - t
    expect(delayMs).toBeGreaterThanOrEqual(BACKOFF_MAX_SEC * 1000 - 100)
    expect(delayMs).toBeLessThanOrEqual(BACKOFF_MAX_SEC * 1000 + 500)
  })

  it('sets status dead_letter with nextRetryAt null when attempts reaches WEBHOOK_MAX_ATTEMPTS', async () => {
    wh.findUniqueOrThrow.mockResolvedValueOnce({ attempts: WEBHOOK_MAX_ATTEMPTS - 1 })
    wh.update.mockResolvedValueOnce({})
    await markFailed('id1', new Error('terminal failure'))
    const call = wh.update.mock.calls[0][0]
    expect(call.data.status).toBe('dead_letter')
    expect(call.data.nextRetryAt).toBeNull()
    expect(call.data.attempts).toBe(WEBHOOK_MAX_ATTEMPTS)
  })
})

describe('recordInboundEvent', () => {
  it('returns alreadyProcessed: true when existing row status is processed', async () => {
    const existing = {
      id: 'wh_1',
      stripeEventId: 'evt_abc',
      type: 'payment_intent.succeeded',
      payloadHash: 'hash',
      status: 'processed',
      orgId: null,
      attempts: 1,
      lastError: null,
      nextRetryAt: null,
      receivedAt: new Date(),
      processedAt: new Date(),
      updatedAt: new Date(),
      metadata: null,
    }
    wh.upsert.mockResolvedValueOnce(existing)
    const result = await recordInboundEvent({
      stripeEventId: 'evt_abc',
      eventType: 'payment_intent.succeeded',
      payloadHash: 'hash',
    })
    expect(result.alreadyProcessed).toBe(true)
    expect(result.event).toBe(existing)
  })

  it('returns alreadyProcessed: false for a freshly created event', async () => {
    const fresh = {
      id: 'wh_2',
      stripeEventId: 'evt_new',
      type: 'charge.succeeded',
      payloadHash: 'hash2',
      status: 'received',
      orgId: null,
      attempts: 0,
      lastError: null,
      nextRetryAt: null,
      receivedAt: new Date(),
      processedAt: null,
      updatedAt: new Date(),
      metadata: null,
    }
    wh.upsert.mockResolvedValueOnce(fresh)
    const result = await recordInboundEvent({
      stripeEventId: 'evt_new',
      eventType: 'charge.succeeded',
      payloadHash: 'hash2',
    })
    expect(result.alreadyProcessed).toBe(false)
  })
})
