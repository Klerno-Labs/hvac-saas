import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_PHOTO_BYTES } from '@/lib/photo-upload'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {
  organizationMember: { findFirst: vi.fn() },
  proofOfWorkAsset: { findFirst: vi.fn() },
  portalToken: { findUnique: vi.fn() },
} }))
const { mockSend, mockDestroy } = vi.hoisted(() => ({ mockSend: vi.fn(), mockDestroy: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: mockSend, destroy: mockDestroy } }),
  GetObjectCommand: vi.fn(function (input) { return input }),
}))
vi.mock('fs/promises', () => ({ readFile: vi.fn() }))

import { GET as teamPhoto } from '@/app/api/photos/[assetId]/route'
import { GET as portalPhoto } from '@/app/api/portal/[token]/photos/[assetId]/route'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { photoReadUrl } from '@/lib/photo-url'
import { photoObjectKey, privatePhotoResponse } from '@/lib/photo-storage'
import { readFile } from 'fs/promises'

const filename = 'bb511f08-9e25-4b7f-a3bb-bf84c93894aa.jpg'
const reference = `r2://bucket/private/org1/job1/${filename}`
const asset = { id: 'asset1', organizationId: 'org1', jobId: 'job1', fileUrl: reference, fileType: 'image/jpeg', fileSize: 5 }
const token = 'a'.repeat(64)
const request = new Request('https://fieldclose.app/api/photos/asset1')
const teamParams = { params: Promise.resolve({ assetId: 'asset1' }) }
const portalParams = { params: Promise.resolve({ token, assetId: 'asset1' }) }
function body(bytes = new TextEncoder().encode('photo')) {
  return { transformToWebStream: () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close() } }) }
}
let currentAsset: typeof asset
let assignedUserId: string
let customerId: string

beforeEach(() => {
  vi.resetAllMocks()
  for (const [key, value] of Object.entries({ R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket', VERCEL: '1' })) vi.stubEnv(key, value)
  vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as never)
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ organizationId: 'org1', role: 'owner' } as never)
  vi.mocked(db.portalToken.findUnique).mockResolvedValue({
    token, customerId: 'customer1', organizationId: 'org1', revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    customer: { id: 'customer1', organizationId: 'org1', deletedAt: null, firstName: 'Customer', lastName: null },
    organization: { id: 'org1', name: 'Business' },
  } as never)
  currentAsset = { ...asset }
  assignedUserId = 'user1'
  customerId = 'customer1'
  // A fixture-backed lookup enforces the query's tenant, job assignment, and
  // customer predicates, so unauthorized tests cannot accidentally read bytes.
  vi.mocked(db.proofOfWorkAsset.findFirst).mockImplementation((async (query: any) => {
    const where = query.where
    if (where.id !== currentAsset.id || where.organizationId !== currentAsset.organizationId) return null
    if (where.job.organizationId !== currentAsset.organizationId) return null
    if (where.job.id?.in?.length === 0) return null
    if (where.job.assignedUserId && where.job.assignedUserId !== assignedUserId) return null
    if (where.job.customer && (where.job.customer.id !== customerId || where.job.customer.organizationId !== currentAsset.organizationId)) return null
    return currentAsset as never
  }) as never)
  mockSend.mockResolvedValue({ ContentLength: 5, Body: body() })
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('private team photo reads', () => {
  it('streams only the authorized object and prevents shared caching and referrer leakage', async () => {
    const response = await teamPhoto(request, teamParams)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('photo')
    expect(mockSend).toHaveBeenCalledWith({ Bucket: 'bucket', Key: `private/org1/job1/${filename}` })
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toContain('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(response.headers.get('location')).toBeNull()
    expect(mockDestroy).toHaveBeenCalledOnce()
  })

  it('requires a signed-in user before querying assets', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const response = await teamPhoto(request, teamParams)
    expect(response.status).toBe(401)
    expect(db.proofOfWorkAsset.findFirst).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('denies another organization even when the asset ID is known', async () => {
    currentAsset.organizationId = 'other-org'
    const response = await teamPhoto(request, teamParams)
    expect(response.status).toBe(404)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('denies an unassigned technician, but allows the assigned technician', async () => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ organizationId: 'org1', role: 'technician' } as never)
    assignedUserId = 'another-user'
    expect((await teamPhoto(request, teamParams)).status).toBe(404)
    expect(mockSend).not.toHaveBeenCalled()
    assignedUserId = 'user1'
    expect((await teamPhoto(request, teamParams)).status).toBe(200)
    expect(db.proofOfWorkAsset.findFirst).toHaveBeenLastCalledWith({ where: {
      id: 'asset1', organizationId: 'org1', job: { organizationId: 'org1', assignedUserId: 'user1' },
    } })
  })

  it('fails closed for an unknown role or missing membership', async () => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ organizationId: 'org1', role: 'unknown' } as never)
    expect((await teamPhoto(request, teamParams)).status).toBe(404)
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null)
    expect((await teamPhoto(request, teamParams)).status).toBe(404)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('fails closed when authorization storage is unavailable', async () => {
    vi.mocked(db.organizationMember.findFirst).mockRejectedValue(new Error('private connection details'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await teamPhoto(request, teamParams)).status).toBe(503)
    expect(mockSend).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('[photo-read] Photo authorization is unavailable')
  })
})

describe('private customer portal photo reads', () => {
  it('allows the valid portal customer without a staff session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect((await portalPhoto(request, portalParams)).status).toBe(200)
    expect(auth).not.toHaveBeenCalled()
    expect(db.proofOfWorkAsset.findFirst).toHaveBeenCalledWith({ where: {
      id: 'asset1', organizationId: 'org1', job: {
        organizationId: 'org1', customer: { id: 'customer1', organizationId: 'org1', deletedAt: null },
      },
    } })
  })

  it.each(['other-customer', 'other-organization'])('denies %s photos', async boundary => {
    if (boundary === 'other-customer') customerId = 'customer2'
    else currentAsset.organizationId = 'org2'
    expect((await portalPhoto(request, portalParams)).status).toBe(404)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it.each(['expired', 'revoked', 'missing'])('rejects a %s token before the asset lookup', async state => {
    if (state === 'missing') vi.mocked(db.portalToken.findUnique).mockResolvedValue(null)
    else {
      const current = await db.portalToken.findUnique({ where: { token } })
      vi.mocked(db.portalToken.findUnique).mockResolvedValue({ ...current,
        ...(state === 'expired' ? { expiresAt: new Date(0) } : { revokedAt: new Date() }),
      } as never)
    }
    expect((await portalPhoto(request, portalParams)).status).toBe(404)
    expect(db.proofOfWorkAsset.findFirst).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('rejects malformed tokens without database access', async () => {
    expect((await portalPhoto(request, { params: Promise.resolve({ token: '../bad', assetId: 'asset1' }) })).status).toBe(404)
    expect(db.portalToken.findUnique).not.toHaveBeenCalled()
  })
})

describe('private object boundaries and legacy URLs', () => {
  it.each([
    `r2://other-bucket/private/org1/job1/${filename}`,
    `r2://bucket/private/org2/job1/${filename}`,
    `r2://bucket/private/org1/job2/${filename}`,
    `r2://bucket/private/org1/job1/../${filename}`,
    `r2://bucket/private/org1/job1/%2e%2e/${filename}`,
    'https://internal.example/private',
  ])('does not fetch a mismatched or arbitrary stored reference: %s', async fileUrl => {
    expect((await privatePhotoResponse({ ...asset, fileUrl })).status).toBe(404)
    expect(mockSend).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
  })

  it('does not serve an oversized object or an unsupported type', async () => {
    expect((await privatePhotoResponse({ ...asset, fileType: 'text/html' })).status).toBe(404)
    expect((await privatePhotoResponse({ ...asset, fileSize: MAX_PHOTO_BYTES + 1 })).status).toBe(404)
    expect(mockSend).not.toHaveBeenCalled()
    mockSend.mockResolvedValue({ ContentLength: MAX_PHOTO_BYTES + 1, Body: body() })
    expect((await privatePhotoResponse(asset)).status).toBe(404)
  })

  it('enforces the byte limit even if storage does not report the object size', async () => {
    mockSend.mockResolvedValue({ Body: body(new Uint8Array(MAX_PHOTO_BYTES + 1)) })
    expect((await privatePhotoResponse(asset)).status).toBe(404)
  })

  it('encodes path punctuation in database identifiers as literal storage segments', () => {
    expect(photoObjectKey('../org', 'job/../other', filename)).toBe(`private/%2E%2E%2Forg/job%2F%2E%2E%2Fother/${filename}`)
  })

  it('reports missing config/provider failures without leaking signed request details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSend.mockRejectedValue(new Error('SECRET credential and private URL'))
    expect((await privatePhotoResponse(asset)).status).toBe(503)
    expect(log).toHaveBeenCalledWith('[photo-read] Private photo storage read failed')
    expect(mockDestroy).toHaveBeenCalledOnce()
    vi.stubEnv('R2_BUCKET', '')
    expect((await privatePhotoResponse(asset)).status).toBe(503)
  })

  it('keeps local development storage behind the same authorization route and disables it on Vercel', async () => {
    const local = { ...asset, fileUrl: `local-private://photos/private/org1/job1/${filename}` }
    expect((await privatePhotoResponse(local)).status).toBe(503)
    expect(readFile).not.toHaveBeenCalled()
    vi.stubEnv('VERCEL', '')
    vi.mocked(readFile).mockResolvedValue(Buffer.from('photo'))
    expect((await privatePhotoResponse(local)).status).toBe(200)
    expect(readFile).toHaveBeenCalledWith(expect.stringContaining(`/.data/private-photos/private/org1/job1/${filename}`))
  })

  it('renders private references through the right access route while preserving existing public records', () => {
    expect(photoReadUrl(asset)).toBe('/api/photos/asset1')
    expect(photoReadUrl(asset, token)).toBe(`/api/portal/${token}/photos/asset1`)
    expect(photoReadUrl({ ...asset, fileUrl: 'https://legacy.example/uploads/a.jpg' })).toBe('https://legacy.example/uploads/a.jpg')
    expect(photoReadUrl({ ...asset, fileUrl: '/uploads/old.jpg' })).toBe('/uploads/old.jpg')
    expect(photoReadUrl({ ...asset, fileUrl: 'javascript:alert(1)' })).toBe('')
  })
})


it('self-hosted production refuses local photo references before reading disk', async () => {
  vi.stubEnv('VERCEL', undefined)
  vi.stubEnv('DEPLOYMENT_ENV', 'production')
  const response = await privatePhotoResponse({ ...asset, fileUrl: `local-private://photos/private/org1/job1/${filename}` })
  expect(response.status).toBe(503)
  expect(readFile).not.toHaveBeenCalled()
  expect(mockSend).not.toHaveBeenCalled()
})
