import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MAX_PHOTO_BYTES } from '@/lib/photo-upload'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {
  organizationMember: { findFirst: vi.fn() }, job: { findFirst: vi.fn() }, proofOfWorkAsset: { create: vi.fn() },
} }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: mockSend } }),
  PutObjectCommand: vi.fn(function (input) { return input }),
}))
vi.mock('fs/promises', () => ({ writeFile: vi.fn(), mkdir: vi.fn() }))

import { POST } from '@/app/api/uploads/route'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { writeFile, mkdir } from 'fs/promises'

const R2_ENV = {
  R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket', R2_PUBLIC_BASE_URL: 'https://pub.r2.dev',
}
function request(file = new File(['photo'], 'test.jpg', { type: 'image/jpeg' })) {
  const form = new FormData()
  form.append('jobId', 'j1')
  form.append('file', file)
  return new Request('http://localhost/api/uploads', { method: 'POST', body: form })
}

beforeEach(() => {
  vi.resetAllMocks()
  for (const [key, value] of Object.entries(R2_ENV)) vi.stubEnv(key, value)
  vi.stubEnv('VERCEL', '')
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
    organizationId: 'org1', role: 'owner', organization: { subscriptionStatus: 'ACTIVE', trialEndsAt: null, readOnlyAt: null },
  } as never)
  vi.mocked(db.job.findFirst).mockResolvedValue({ id: 'j1' } as never)
  vi.mocked(db.proofOfWorkAsset.create).mockResolvedValue({ id: 'asset1' } as never)
  vi.mocked(trackEvent).mockResolvedValue({} as never)
  vi.mocked(writeFile).mockResolvedValue(undefined)
  vi.mocked(mkdir).mockResolvedValue(undefined)
  mockSend.mockResolvedValue({})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('POST /api/uploads multipart storage', () => {
  it('stores actual image bytes in R2 before creating a visible asset or success event', async () => {
    vi.stubEnv('VERCEL', '1')
    const response = await POST(request() as never)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ id: 'asset1', fileUrl: expect.stringMatching(/^https:\/\/pub\.r2\.dev\/uploads\/[a-f0-9-]+\.jpg$/) })
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      Bucket: 'bucket', ContentType: 'image/jpeg', ContentLength: 5, Body: Buffer.from('photo'),
    }))
    expect(db.proofOfWorkAsset.create).toHaveBeenCalledWith({ data: {
      organizationId: 'org1', jobId: 'j1', fileUrl: body.fileUrl, fileType: 'image/jpeg', fileSize: 5,
    } })
    expect(mockSend.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(db.proofOfWorkAsset.create).mock.invocationCallOrder[0])
    expect(mockSend.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(trackEvent).mock.invocationCallOrder[0])
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('does not record an uploaded asset when object storage rejects the upload', async () => {
    mockSend.mockRejectedValue(new Error('storage unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await POST(request() as never)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Photo upload failed. Please try again.' })
    expect(db.proofOfWorkAsset.create).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it.each(Object.keys(R2_ENV))('fails closed on Vercel if %s is missing', async missing => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv(missing, '')
    const response = await POST(request() as never)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Photo storage is not configured. Contact your administrator.' })
    expect(mockSend).not.toHaveBeenCalled()
    expect(mkdir).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(db.proofOfWorkAsset.create).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('preserves the local development filesystem fallback', async () => {
    for (const key of Object.keys(R2_ENV)) vi.stubEnv(key, '')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = await POST(request() as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'asset1', fileUrl: expect.stringMatching(/^\/uploads\/[a-f0-9-]+\.jpg$/) })
    expect(writeFile).toHaveBeenCalledWith(expect.stringMatching(/\/public\/uploads\/[a-f0-9-]+\.jpg$/), Buffer.from('photo'))
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('accepts a 4 MB photo through the actual multipart parser', async () => {
    const response = await POST(request(new File([new Uint8Array(MAX_PHOTO_BYTES)], 'photo.webp', { type: 'image/webp' })) as never)
    expect(response.status).toBe(200)
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ ContentLength: MAX_PHOTO_BYTES, ContentType: 'image/webp' }))
  })

  it('rejects a photo above 4 MB before any storage or database write', async () => {
    const response = await POST(request(new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], 'large.jpg', { type: 'image/jpeg' })) as never)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'File too large. Maximum size is 4 MB.' })
    expect(mockSend).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(db.proofOfWorkAsset.create).not.toHaveBeenCalled()
  })

  it('rejects unsupported photo types before storage', async () => {
    const response = await POST(request(new File(['script'], 'photo.svg', { type: 'image/svg+xml' })) as never)
    expect(response.status).toBe(400)
    expect(mockSend).not.toHaveBeenCalled()
    expect(db.proofOfWorkAsset.create).not.toHaveBeenCalled()
  })

  it('rejects a job outside the user assignment or organization before storage', async () => {
    vi.mocked(db.job.findFirst).mockResolvedValue(null)
    const response = await POST(request() as never)
    expect(response.status).toBe(404)
    expect(mockSend).not.toHaveBeenCalled()
    expect(db.proofOfWorkAsset.create).not.toHaveBeenCalled()
  })
})
