import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    organizationMember: { findFirst: vi.fn() },
    job: { findFirst: vi.fn() },
    proofOfWorkAsset: { create: vi.fn() },
  },
}))

vi.mock('@/lib/events', () => ({
  trackEvent: vi.fn(),
}))

const mockGetSignedUrl = vi.fn()

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({})),
  PutObjectCommand: vi.fn((p) => p),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}))

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

const R2_ENV = {
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
  R2_PUBLIC_BASE_URL: 'https://pub.r2.dev',
}

describe('POST /api/uploads', () => {
  beforeEach(async () => {
    Object.assign(process.env, R2_ENV)

    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)

    const { db } = await import('@/lib/db')
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ organizationId: 'org1' } as never)
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: 'j1' } as never)
    vi.mocked(db.proofOfWorkAsset.create).mockResolvedValue({ id: 'asset1', fileUrl: '' } as never)

    const { trackEvent } = await import('@/lib/events')
    vi.mocked(trackEvent).mockResolvedValue(undefined)

    mockGetSignedUrl.mockResolvedValue('https://presigned.r2.example.com/put?sig=abc')
  })

  afterEach(() => {
    for (const k of Object.keys(R2_ENV)) delete process.env[k]
    vi.clearAllMocks()
  })

  it('with R2 configured: returns presignedUrl for client PUT without server-side upload', async () => {
    const { POST } = await import('@/app/api/uploads/route')

    const formData = new FormData()
    formData.append('jobId', 'j1')
    formData.append('file', new File(['photo'], 'test.jpg', { type: 'image/jpeg' }))

    const req = new Request('http://localhost/api/uploads', { method: 'POST', body: formData })
    const res = await POST(req as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.presignedUrl).toBe('https://presigned.r2.example.com/put?sig=abc')
    expect(body.fileUrl).toMatch(/^https:\/\/pub\.r2\.dev\/uploads\/[a-f0-9-]+\.jpg$/)
    expect(body.id).toBe('asset1')
    expect(mockGetSignedUrl).toHaveBeenCalledOnce()
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 300 },
    )
  })

  it('with R2 configured: persists asset record with R2 public URL before client PUT', async () => {
    const { POST } = await import('@/app/api/uploads/route')
    const { db } = await import('@/lib/db')

    const formData = new FormData()
    formData.append('jobId', 'j1')
    formData.append('file', new File(['photo'], 'test.jpg', { type: 'image/jpeg' }))

    const req = new Request('http://localhost/api/uploads', { method: 'POST', body: formData })
    await POST(req as never)

    expect(vi.mocked(db.proofOfWorkAsset.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org1',
          jobId: 'j1',
          fileType: 'image/jpeg',
          fileUrl: expect.stringMatching(/^https:\/\/pub\.r2\.dev\/uploads\//),
        }),
      }),
    )
  })

  it('without R2: falls back to local filesystem, no presignedUrl in response', async () => {
    for (const k of Object.keys(R2_ENV)) delete process.env[k]

    const { POST } = await import('@/app/api/uploads/route')

    const formData = new FormData()
    formData.append('jobId', 'j1')
    formData.append('file', new File(['photo'], 'test.jpg', { type: 'image/jpeg' }))

    const req = new Request('http://localhost/api/uploads', { method: 'POST', body: formData })
    const res = await POST(req as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.presignedUrl).toBeUndefined()
    expect(body.fileUrl).toMatch(/^\/uploads\/[a-f0-9-]+\.jpg$/)
    expect(mockGetSignedUrl).not.toHaveBeenCalled()
  })
})
