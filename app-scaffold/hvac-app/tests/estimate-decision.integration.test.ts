import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
vi.mock('@/lib/portal', () => ({ validatePortalToken: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ success: true })) }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { validatePortalToken } = await import('@/lib/portal')
const { sendEmail } = await import('@/lib/email')
const { approveEstimate, declineEstimate } = await import('@/app/portal/[token]/estimates/[estimateId]/approval-actions')
let organizationId: string
let customerId: string
let jobId: string
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2Z8AAAAASUVORK5CYII='
const signature = { signerName: 'Alex Customer', signatureDataUrl: png }
beforeAll(async () => {
  organizationId = (await db.organization.create({ data: { name: 'Estimate decision fixture', email: 'owner@example.test' } })).id
  customerId = (await db.customer.create({ data: { organizationId, firstName: 'Alex' } })).id
  jobId = (await db.job.create({ data: { organizationId, customerId, title: 'Service <equipment>' } })).id
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(validatePortalToken).mockResolvedValue({ organizationId, customerId } as never)
})
afterAll(async () => {
  await db.organization.delete({ where: { id: organizationId } })
  await db.$disconnect()
})
const fixture = (status = 'sent') => db.estimate.create({ data: { organizationId, jobId, estimateNumber: randomUUID(), status, totalCents: 10000 } })
describe('customer estimate decisions against PostgreSQL', () => {
  it('accepts only one of simultaneous opposing decisions and records it once', async () => {
    const estimate = await fixture()
    const results = await Promise.all([
      approveEstimate('fixture-token', estimate.id, signature),
      declineEstimate('fixture-token', estimate.id, { signerName: 'Alex Customer', reason: 'Changed plans' }),
    ])
    expect(results.filter(result => result.success)).toHaveLength(1)
    const updated = await db.estimate.findUniqueOrThrow({ where: { id: estimate.id } })
    expect(['accepted', 'declined']).toContain(updated.status)
    expect(await db.activityEvent.count({ where: { entityId: estimate.id } })).toBe(1)
    expect(await db.auditLog.count({ where: { targetId: estimate.id } })).toBe(1)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
  it('does not reveal or accept unpublished draft estimates', async () => {
    const estimate = await fixture('draft')
    expect((await approveEstimate('fixture-token', estimate.id, signature)).success).toBe(false)
    expect((await declineEstimate('fixture-token', estimate.id, { signerName: 'Alex Customer' })).success).toBe(false)
    expect((await db.estimate.findUniqueOrThrow({ where: { id: estimate.id } })).status).toBe('draft')
  })
  it('rejects a different customer even within the same organization', async () => {
    const estimate = await fixture()
    vi.mocked(validatePortalToken).mockResolvedValue({ organizationId, customerId: 'different-customer' } as never)
    expect((await approveEstimate('fixture-token', estimate.id, signature)).success).toBe(false)
  })
  it('repeated approval is idempotent and cannot become a decline', async () => {
    const estimate = await fixture()
    expect((await approveEstimate('fixture-token', estimate.id, signature)).success).toBe(true)
    expect((await approveEstimate('fixture-token', estimate.id, signature)).success).toBe(true)
    expect((await declineEstimate('fixture-token', estimate.id, { signerName: 'Alex Customer' })).success).toBe(false)
    expect(await db.activityEvent.count({ where: { entityId: estimate.id } })).toBe(1)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
  it('escapes customer-controlled text in the notification', async () => {
    const estimate = await fixture()
    expect((await declineEstimate('fixture-token', estimate.id, { signerName: '<img src=x>', reason: '<script>bad</script>' })).success).toBe(true)
    const email = vi.mocked(sendEmail).mock.calls[0][0]
    expect(email.html).toContain('&lt;img src=x&gt;')
    expect(email.html).toContain('&lt;script&gt;bad&lt;/script&gt;')
    expect(email.html).toContain('Service &lt;equipment&gt;')
    expect(email.html).not.toContain('<script>')
  })
  it('keeps the recorded decision if notification delivery fails', async () => {
    const estimate = await fixture()
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Email unavailable'))
    expect((await approveEstimate('fixture-token', estimate.id, signature)).success).toBe(true)
    expect((await db.estimate.findUniqueOrThrow({ where: { id: estimate.id } })).status).toBe('accepted')
  })
})
