import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), send: vi.fn(), destroy: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@aws-sdk/client-s3', async importOriginal => ({
  ...await importOriginal<typeof import('@aws-sdk/client-s3')>(),
  S3Client: vi.fn(function () { return { send: mocks.send, destroy: mocks.destroy } }),
}))

if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { GET: teamPhoto } = await import('@/app/api/photos/[assetId]/route')
const { GET: portalPhoto } = await import('@/app/api/portal/[token]/photos/[assetId]/route')
const { validatePortalToken, getOrCreatePortalUrl } = await import('@/lib/portal')

const organizationIds: string[] = []
const userIds: string[] = []
let ownerId: string
let assignedId: string
let unassignedId: string
let otherOwnerId: string
let assetId: string
let mismatchedJobAssetId: string
let objectKey: string
let customerToken: string
let otherCustomerToken: string
let otherOrganizationToken: string
let revokedToken: string
let expiredToken: string
let mismatchedCustomerToken: string
let customerId: string
const request = new Request('https://fieldclose.example.test/api/photos/fixture')

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: 'Private photo access fixture' } })
  organizationIds.push(org.id)
  const otherOrg = await db.organization.create({ data: { name: 'Other private photo fixture' } })
  organizationIds.push(otherOrg.id)
  async function member(organizationId: string, role: string) {
    const user = await db.user.create({ data: { email: `${randomUUID()}@photo-fixture.example.test` } })
    userIds.push(user.id)
    await db.organizationMember.create({ data: { organizationId, userId: user.id, role } })
    return user.id
  }
  ownerId = await member(org.id, 'owner')
  assignedId = await member(org.id, 'technician')
  unassignedId = await member(org.id, 'technician')
  otherOwnerId = await member(otherOrg.id, 'owner')
  const customer = await db.customer.create({ data: { organizationId: org.id, firstName: 'Photo customer' } })
  customerId = customer.id
  const otherCustomer = await db.customer.create({ data: { organizationId: org.id, firstName: 'Other customer' } })
  const outsideCustomer = await db.customer.create({ data: { organizationId: otherOrg.id, firstName: 'Other organization customer' } })
  const job = await db.job.create({ data: { organizationId: org.id, customerId: customer.id, title: 'Private photo', assignedUserId: assignedId } })
  const outsideJob = await db.job.create({ data: { organizationId: otherOrg.id, customerId: outsideCustomer.id, title: 'Other organization job' } })
  objectKey = `private/${org.id}/${job.id}/${randomUUID()}.jpg`
  assetId = (await db.proofOfWorkAsset.create({ data: {
    organizationId: org.id, jobId: job.id, fileUrl: `r2://photo-fixture/${objectKey}`, fileType: 'image/jpeg', fileSize: 5,
  } })).id
  // The schema has separate org/job foreign keys. A legacy inconsistent row
  // must not bypass the authorized job relation simply because its org matches.
  mismatchedJobAssetId = (await db.proofOfWorkAsset.create({ data: {
    organizationId: org.id, jobId: outsideJob.id,
    fileUrl: `r2://photo-fixture/private/${org.id}/${outsideJob.id}/${randomUUID()}.jpg`, fileType: 'image/jpeg', fileSize: 5,
  } })).id
  async function portal(organizationId: string, customerId: string, state?: 'revoked' | 'expired') {
    const token = randomBytes(32).toString('hex')
    await db.portalToken.create({ data: {
      organizationId, customerId, token,
      expiresAt: state === 'expired' ? new Date(0) : new Date(Date.now() + 86_400_000),
      revokedAt: state === 'revoked' ? new Date() : null,
    } })
    return token
  }
  customerToken = await portal(org.id, customer.id)
  otherCustomerToken = await portal(org.id, otherCustomer.id)
  otherOrganizationToken = await portal(otherOrg.id, outsideCustomer.id)
  revokedToken = await portal(org.id, customer.id, 'revoked')
  expiredToken = await portal(org.id, customer.id, 'expired')
  mismatchedCustomerToken = await portal(otherOrg.id, customer.id)
})

beforeEach(() => {
  vi.clearAllMocks()
  for (const [key, value] of Object.entries({ R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture', R2_BUCKET: 'photo-fixture', VERCEL: '1' })) vi.stubEnv(key, value)
  mocks.auth.mockResolvedValue({ user: { id: ownerId } })
  mocks.send.mockImplementation(async () => ({
    ContentLength: 5,
    Body: { transformToWebStream: () => new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('photo')); controller.close() },
    }) },
  }))
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } })
  await db.user.deleteMany({ where: { id: { in: userIds } } })
  await db.$disconnect()
})

const readTeam = (id = assetId) => teamPhoto(request, { params: Promise.resolve({ assetId: id }) })
const readPortal = (token: string, id = assetId) => portalPhoto(request, { params: Promise.resolve({ token, assetId: id }) })

describe('private photo authorization against PostgreSQL', () => {
  it('serves the owner and assigned technician through real membership/job relations', async () => {
    for (const userId of [ownerId, assignedId]) {
      mocks.auth.mockResolvedValue({ user: { id: userId } })
      const response = await readTeam()
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('photo')
      expect(response.headers.get('cache-control')).toContain('private, no-store')
    }
    expect(mocks.send).toHaveBeenCalledTimes(2)
    expect(mocks.send.mock.calls[0][0].input).toEqual({ Bucket: 'photo-fixture', Key: objectKey })
    expect(mocks.destroy).toHaveBeenCalledTimes(2)
  })

  it('denies another organization owner and an unassigned technician before object retrieval', async () => {
    for (const userId of [otherOwnerId, unassignedId]) {
      mocks.auth.mockResolvedValue({ user: { id: userId } })
      expect((await readTeam()).status).toBe(404)
    }
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('denies a mismatched organization/job asset row even to its organization owner', async () => {
    expect((await readTeam(mismatchedJobAssetId)).status).toBe(404)
    expect((await readPortal(customerToken, mismatchedJobAssetId)).status).toBe(404)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('allows the correct customer token without a staff session and denies other customer/org tokens', async () => {
    mocks.auth.mockResolvedValue(null)
    const allowed = await readPortal(customerToken)
    expect(allowed.status).toBe(200)
    expect(await allowed.text()).toBe('photo')
    expect((await readPortal(otherCustomerToken)).status).toBe(404)
    expect((await readPortal(otherOrganizationToken)).status).toBe(404)
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledOnce()
  })

  it('honors persisted revocation and expiration before object retrieval', async () => {
    expect((await readPortal(revokedToken)).status).toBe(404)
    expect((await readPortal(expiredToken)).status).toBe(404)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('rejects an inconsistent token/customer organization at the shared portal boundary', async () => {
    expect(await validatePortalToken(mismatchedCustomerToken)).toBeNull()
    expect((await readPortal(mismatchedCustomerToken)).status).toBe(404)
    await expect(getOrCreatePortalUrl(organizationIds[1], customerId)).rejects.toThrow('Customer not found')
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('invalidates an existing portal capability when its customer is soft-deleted', async () => {
    await db.customer.update({ where: { id: customerId }, data: { deletedAt: new Date() } })
    try {
      expect(await validatePortalToken(customerToken)).toBeNull()
      expect((await readPortal(customerToken)).status).toBe(404)
      await expect(getOrCreatePortalUrl(organizationIds[0], customerId)).rejects.toThrow('Customer not found')
      expect(mocks.send).not.toHaveBeenCalled()
    } finally {
      await db.customer.update({ where: { id: customerId }, data: { deletedAt: null } })
    }
  })
})
