import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  access: vi.fn(), transaction: vi.fn(), create: vi.fn(), event: vi.fn(),
  outsideCreate: vi.fn(), outsideEvent: vi.fn(), revalidate: vi.fn(),
}))
vi.mock('@/lib/mutation-access', () => ({ requireMutationAccess: mocks.access }))
vi.mock('@/lib/db', () => ({ db: {
  $transaction: mocks.transaction,
  priceBookItem: { create: mocks.outsideCreate },
  activityEvent: { create: mocks.outsideEvent },
} }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
// Use the real trackEvent helper to verify the action passes its transaction client.
import { createPriceBookItem } from '@/app/pricebook/actions'

const tx = { priceBookItem: { create: mocks.create }, activityEvent: { create: mocks.event } }
const invalidTextFields: Array<Record<string, string>> = [
  { name: '   ' }, { name: 'x'.repeat(201) }, { category: 'x'.repeat(101) },
  { description: 'x'.repeat(2001) }, { imageUrl: 'x'.repeat(1001) },
]
function form(overrides: Record<string, string> = {}) {
  const data = new FormData()
  Object.entries({ name: 'Seasonal inspection', flatPrice: '149.95', cost: '29.50', ...overrides }).forEach(([key, value]) => data.set(key, value))
  return data
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.access.mockResolvedValue({ authorized: true, context: { organizationId: 'server-org', userId: 'server-owner' } })
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
  mocks.create.mockResolvedValue({ id: 'new-service' })
  mocks.event.mockResolvedValue({ id: 'new-event' })
})

describe('pricebook creation access and amounts', () => {
  it.each([
    [401, 'You must be logged in'],
    [403, 'Your role does not have permission to make this change'],
    [403, 'Your workspace is read-only. Ask the owner to update the subscription in Billing.'],
  ])('fails closed before validation or database access: %s %s', async (status, error) => {
    mocks.access.mockResolvedValue({ authorized: false, status, error })
    expect(await createPriceBookItem(new FormData())).toEqual({ success: false, error })
    expect(mocks.access).toHaveBeenCalledWith('editPricing')
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.outsideCreate).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it('uses server-owned organization and actor, converts dollars to cents, and returns only the created id', async () => {
    expect(await createPriceBookItem(form({ name: '  Seasonal inspection  ', organizationId: 'attacker-org', userId: 'attacker-user', flatPriceCents: '1', category: 'Maintenance', description: 'Inspect the system.' }))).toEqual({ success: true, itemId: 'new-service' })
    expect(mocks.create).toHaveBeenCalledWith({ data: {
      organizationId: 'server-org', name: 'Seasonal inspection', category: 'Maintenance', description: 'Inspect the system.',
      flatPriceCents: 14995, costCents: 2950, imageUrl: null,
    } })
    expect(mocks.event).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: 'server-org', userId: 'server-owner', eventName: 'pricebook_item_created', entityType: 'pricebook_item', entityId: 'new-service' }) })
    expect(mocks.outsideCreate).not.toHaveBeenCalled()
    expect(mocks.outsideEvent).not.toHaveBeenCalled()
  })

  it.each([
    ['0', '', 0, null],
    ['1.01', '0.29', 101, 29],
    [' 10.10 ', ' 0 ', 1010, 0],
    ['21474836.47', '21474836.47', 2147483647, 2147483647],
  ])('preserves supported prices and optional cost: %s, %s', async (flatPrice, cost, priceCents, costCents) => {
    expect(await createPriceBookItem(form({ flatPrice, cost }))).toMatchObject({ success: true })
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ flatPriceCents: priceCents, costCents }) })
  })

  it.each(['', '-1', '1.005', '1e2', 'NaN', 'Infinity', '0x10', '1,000', '21474836.48', '9999999999999999999999999999'])('rejects invalid or overflowing price before opening a transaction: %s', async flatPrice => {
    expect(await createPriceBookItem(form({ flatPrice }))).toMatchObject({ success: false, error: expect.any(String) })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each(['-0.01', '0.001', '1e2', 'Infinity', '21474836.48'])('validates internal cost independently: %s', async cost => {
    expect(await createPriceBookItem(form({ cost }))).toMatchObject({ success: false })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each(invalidTextFields)('rejects invalid text fields before writing: %j', async fields => {
    expect(await createPriceBookItem(form(fields))).toMatchObject({ success: false })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})

describe('pricebook transactional event and failure behavior', () => {
  it('does not complete or refresh views until its activity event has committed', async () => {
    let releaseEvent!: (value: { id: string }) => void
    const recorded = new Promise<{ id: string }>(resolve => { releaseEvent = resolve })
    mocks.event.mockReturnValue(recorded)
    let completed = false
    const operation = createPriceBookItem(form()).then(result => { completed = true; return result })
    await vi.waitFor(() => expect(mocks.event).toHaveBeenCalledTimes(1))
    expect(completed).toBe(false)
    expect(mocks.revalidate).not.toHaveBeenCalled()
    releaseEvent({ id: 'event' })
    expect(await operation).toEqual({ success: true, itemId: 'new-service' })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.revalidate.mock.calls).toEqual([['/pricebook'], ['/setup'], ['/dashboard']])
  })

  it('propagates an event failure through the transaction instead of reporting successful creation', async () => {
    const failure = new Error('private database event failure')
    mocks.event.mockRejectedValue(failure)
    let transactionError: unknown
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => {
      try { return await callback(tx) } catch (error) { transactionError = error; throw error }
    })
    const result = await createPriceBookItem(form())
    expect(transactionError).toBe(failure)
    expect(result).toEqual({ success: false, error: 'We could not confirm the new item. Check your price book before trying again.' })
    expect(mocks.outsideEvent).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it.each(['connection', 'create'])('handles %s failures without leaking internal errors or writing an activity record', async point => {
    const failure = new Error('secret-host.example: database credentials rejected')
    if (point === 'connection') mocks.transaction.mockRejectedValue(failure)
    else mocks.create.mockRejectedValue(failure)
    const result = await createPriceBookItem(form())
    expect(result).toMatchObject({ success: false })
    expect(JSON.stringify(result)).not.toContain('secret-host')
    expect(mocks.event).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it('does not promise a safe duplicate-free retry when view refresh fails after the transaction', async () => {
    mocks.revalidate.mockImplementation(() => { throw new Error('Cache unavailable') })
    const result = await createPriceBookItem(form())
    expect(mocks.event).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ success: false, error: 'We could not confirm the new item. Check your price book before trying again.' })
  })
})
