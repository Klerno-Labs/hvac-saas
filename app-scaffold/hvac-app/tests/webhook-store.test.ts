import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  hashPayload,
  recordInboundEvent,
  markProcessed,
  markFailed,
  dueForRetry,
  listDeadLettered,
  markReplayed,
  WEBHOOK_MAX_ATTEMPTS,
  BACKOFF_BASE_SEC,
  BACKOFF_MAX_SEC,
} from '@/lib/webhook-store'
import { db } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  db: {
    webhookEvent: {
      upsert: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

beforeEach(() => {
  vi.resetAllMocks()
})

type UpdateArgs = {
  where: { id: string }
  data: {
    status?: string
    attempts?: number
    nextRetryAt?: Date | null
    lastError?: string | null
    processedAt?: Date | null
  }
}

function updateCall(at: number): UpdateArgs {
  const mock = vi.mocked(db.webhookEvent.update)
  return mock.mock.calls[at][0] as unknown as UpdateArgs
}

describe('hashPayload', () => {
  it('is deterministic and differs for different bodies', () => {
    const a1 = hashPayload('{"id":"evt_1"}')
    const a2 = hashPayload('{"id":"evt_1"}')
    const b = hashPayload('{"id":"evt_2"}')

    expect(a1).toBe(a2)
    expect(a1).not.toBe(b)
    expect(a1).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('markFailed backoff', () => {
  beforeEach(() => {
    vi.mocked(db.webhookEvent.update).mockResolvedValue({} as never)
  })

  it('schedules ~60s on attempt 1 and ~120s on attempt 2 (doubling + cap)', async () => {
    const before = Date.now()

    vi.mocked(db.webhookEvent.findUnique).mockResolvedValueOnce({ attempts: 0 } as never)
    await markFailed('wh_1', new Error('boom'))
    const d1 = updateCall(0).data
    expect(d1.status).toBe('failed')
    expect(d1.attempts).toBe(1)
    const gap1 = ((d1.nextRetryAt as Date).getTime() - before) / 1000
    expect(gap1).toBeGreaterThanOrEqual(BACKOFF_BASE_SEC - 1)
    expect(gap1).toBeLessThanOrEqual(BACKOFF_BASE_SEC + 1)

    vi.mocked(db.webhookEvent.findUnique).mockResolvedValueOnce({ attempts: 1 } as never)
    await markFailed('wh_2', new Error('boom'))
    const d2 = updateCall(1).data
    expect(d2.attempts).toBe(2)
    const gap2 = ((d2.nextRetryAt as Date).getTime() - before) / 1000
    expect(gap2).toBeGreaterThanOrEqual(BACKOFF_BASE_SEC * 2 - 1)
    expect(gap2).toBeLessThanOrEqual(BACKOFF_BASE_SEC * 2 + 1)

    // Cap: raise maxAttempts so the row does NOT dead-letter, then use an attempt
    // high enough that 60 * 2**(a-1) would exceed the 3600s ceiling. With the
    // default maxAttempts (5) the row dead-letters before the cap is ever hit.
    vi.mocked(db.webhookEvent.findUnique).mockResolvedValueOnce({ attempts: 6 } as never)
    await markFailed('wh_cap', new Error('boom'), { maxAttempts: 50 })
    const dCap = updateCall(2).data
    expect(dCap.status).toBe('failed')
    const gapCap = ((dCap.nextRetryAt as Date).getTime() - before) / 1000
    expect(gapCap).toBeGreaterThanOrEqual(BACKOFF_MAX_SEC - 1)
    expect(gapCap).toBeLessThanOrEqual(BACKOFF_MAX_SEC + 1)
  })

  it('dead-letters with nextRetryAt null once attempts reach WEBHOOK_MAX_ATTEMPTS', async () => {
    vi.mocked(db.webhookEvent.findUnique).mockResolvedValueOnce({
      attempts: WEBHOOK_MAX_ATTEMPTS - 1,
    } as never)
    await markFailed('wh_dead', new Error('boom'))

    expect(vi.mocked(db.webhookEvent.update)).toHaveBeenCalledWith({
      where: { id: 'wh_dead' },
      data: {
        status: 'dead_letter',
        attempts: WEBHOOK_MAX_ATTEMPTS,
        lastError: 'boom',
        nextRetryAt: null,
      },
    })
  })

  it('truncates lastError to <= 1000 chars and stores message only', async () => {
    vi.mocked(db.webhookEvent.findUnique).mockResolvedValueOnce({ attempts: 0 } as never)
    const longMsg = 'x'.repeat(2500)
    await markFailed('wh_long', new Error(longMsg))

    const d = updateCall(0).data
    expect(d.lastError).toHaveLength(1000)
    expect(d.lastError).toBe('x'.repeat(1000))
  })
})

describe('recordInboundEvent', () => {
  it('returns alreadyProcessed true when the existing row status is processed', async () => {
    vi.mocked(db.webhookEvent.upsert).mockResolvedValueOnce({
      id: 'wh_1',
      stripeEventId: 'evt_1',
      type: 'invoice.paid',
      status: 'processed',
    } as never)

    const res = await recordInboundEvent({
      stripeEventId: 'evt_1',
      eventType: 'invoice.paid',
      payloadHash: 'abc',
    })

    expect(res.alreadyProcessed).toBe(true)
  })

  it('returns alreadyProcessed false for a fresh received row and seeds status/attempts', async () => {
    vi.mocked(db.webhookEvent.upsert).mockResolvedValueOnce({
      id: 'wh_2',
      stripeEventId: 'evt_2',
      type: 'invoice.paid',
      status: 'received',
    } as never)

    const res = await recordInboundEvent({
      stripeEventId: 'evt_2',
      eventType: 'invoice.paid',
      payloadHash: 'abc',
      organizationId: 'org_99',
    })

    expect(res.alreadyProcessed).toBe(false)
    expect(vi.mocked(db.webhookEvent.upsert)).toHaveBeenCalledWith({
      where: { stripeEventId: 'evt_2' },
      create: {
        stripeEventId: 'evt_2',
        type: 'invoice.paid',
        payloadHash: 'abc',
        orgId: 'org_99',
        status: 'received',
        attempts: 0,
      },
      update: {},
    })
  })
})

describe('remaining helpers', () => {
  beforeEach(() => {
    vi.mocked(db.webhookEvent.update).mockResolvedValue({} as never)
    vi.mocked(db.webhookEvent.findMany).mockResolvedValue([] as never)
  })

  it('markProcessed sets processed state and clears error/retry', async () => {
    await markProcessed('wh_1')
    const args = vi.mocked(db.webhookEvent.update).mock.calls[0][0] as unknown as UpdateArgs
    expect(args.where.id).toBe('wh_1')
    expect(args.data.status).toBe('processed')
    expect(args.data.lastError).toBeNull()
    expect(args.data.nextRetryAt).toBeNull()
    expect(args.data.processedAt).toBeInstanceOf(Date)
  })

  it('markReplayed sets replayed state with nextRetryAt null', async () => {
    await markReplayed('wh_1')
    const args = vi.mocked(db.webhookEvent.update).mock.calls[0][0] as unknown as UpdateArgs
    expect(args.data.status).toBe('replayed')
    expect(args.data.nextRetryAt).toBeNull()
    expect(args.data.processedAt).toBeInstanceOf(Date)
  })

  it('dueForRetry queries failed rows due now, ordered by nextRetryAt', async () => {
    await dueForRetry(7)
    const args = vi.mocked(db.webhookEvent.findMany).mock.calls[0][0] as {
      where: { status: string; nextRetryAt: { lte: Date } }
      orderBy: { nextRetryAt: 'asc' }
      take: number
    }
    expect(args.where.status).toBe('failed')
    expect(args.where.nextRetryAt.lte).toBeInstanceOf(Date)
    expect(args.orderBy.nextRetryAt).toBe('asc')
    expect(args.take).toBe(7)
  })

  it('listDeadLettered queries dead_letter rows ordered by updatedAt desc', async () => {
    await listDeadLettered({ limit: 50 })
    const args = vi.mocked(db.webhookEvent.findMany).mock.calls[0][0] as {
      where: { status: string }
      orderBy: { updatedAt: 'desc' }
      take: number
    }
    expect(args.where.status).toBe('dead_letter')
    expect(args.orderBy.updatedAt).toBe('desc')
    expect(args.take).toBe(50)
  })
})
