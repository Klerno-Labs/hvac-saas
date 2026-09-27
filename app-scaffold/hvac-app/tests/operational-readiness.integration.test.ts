import { afterAll, describe, expect, it } from 'vitest'
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { inspectDatabase } = await import('@/lib/operational-readiness')
afterAll(() => db.$disconnect())
describe('operational database inspection against PostgreSQL', () => {
  it('reads actual generated schema, unique identities and backlog without mutations', async () => {
    const result = await inspectDatabase(db)
    expect(result.connected).toBe(true)
    expect(result.columns).toContainEqual({ table_name: 'Invoice', column_name: 'outstandingCents' })
    expect(result.uniqueKeys).toContainEqual({ table_name: 'Payment', columns: ['stripePaymentIntent'] })
    expect(result.queues).toEqual(expect.objectContaining({ failedWebhooks: expect.any(Number), collectionRetry: expect.any(Number), collectionReview: expect.any(Number) }))
  })
})
