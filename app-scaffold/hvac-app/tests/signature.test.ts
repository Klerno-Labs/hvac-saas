import { describe, it, expect, vi } from 'vitest'
import { saveJobSignature } from '@/app/jobs/[jobId]/proof-of-work/signature-actions'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { trackEvent } from '@/lib/events'

vi.mock('@/lib/db')
vi.mock('@/lib/auth')
vi.mock('@/lib/events')

describe('saveJobSignature', () => {
  it('requires user authentication', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const formData = new FormData()
    formData.append('signerName', 'John Doe')
    formData.append('signatureDataUrl', 'data:image/png;base64,abc123')

    const result = await saveJobSignature('job123', formData)

    expect(result).toEqual({ success: false, error: 'You must be logged in' })
  })

  it('requires organization membership', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user123', email: 'test@example.com', name: 'Test User' },
    } as any)

    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null)

    const formData = new FormData()
    formData.append('signerName', 'John Doe')
    formData.append('signatureDataUrl', 'data:image/png;base64,abc123')

    const result = await saveJobSignature('job123', formData)

    expect(result).toEqual({ success: false, error: 'You must belong to an organization' })
  })

  it('validates signature data', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user123', email: 'test@example.com', name: 'Test User' },
    } as any)

    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      organizationId: 'org123',
    } as any)

    vi.mocked(db.job.findFirst).mockResolvedValue({
      id: 'job123',
      organizationId: 'org123',
    } as any)

    const formData = new FormData()
    formData.append('signerName', '')
    formData.append('signatureDataUrl', '')

    const result = await saveJobSignature('job123', formData)

    expect(result.success).toBe(false)
    expect(result.error).toContain('required')
  })

  it('requires signer name', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user123', email: 'test@example.com', name: 'Test User' },
    } as any)

    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      organizationId: 'org123',
    } as any)

    vi.mocked(db.job.findFirst).mockResolvedValue({
      id: 'job123',
      organizationId: 'org123',
    } as any)

    const formData = new FormData()
    formData.append('signerName', '')
    formData.append('signatureDataUrl', 'data:image/png;base64,abc123')

    const result = await saveJobSignature('job123', formData)

    expect(result.success).toBe(false)
  })

  it('validates job belongs to organization', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user123', email: 'test@example.com', name: 'Test User' },
    } as any)

    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      organizationId: 'org123',
    } as any)

    vi.mocked(db.job.findFirst).mockResolvedValue(null)

    const formData = new FormData()
    formData.append('signerName', 'John Doe')
    formData.append('signatureDataUrl', 'data:image/png;base64,abc123')

    const result = await saveJobSignature('job123', formData)

    expect(result).toEqual({ success: false, error: 'Job not found in your organization' })
  })

  it('successfully saves valid signature', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user123', email: 'test@example.com', name: 'Test User' },
    } as any)

    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      organizationId: 'org123',
    } as any)

    vi.mocked(db.job.findFirst).mockResolvedValue({
      id: 'job123',
      organizationId: 'org123',
    } as any)

    vi.mocked(db.jobSignature.create).mockResolvedValue({
      id: 'sig123',
      organizationId: 'org123',
      jobId: 'job123',
      signerName: 'John Doe',
      signatureImageUrl: 'data:image/png;base64,abc123',
      signedAt: new Date(),
    } as any)

    vi.mocked(trackEvent).mockResolvedValue(undefined)

    const formData = new FormData()
    formData.append('signerName', 'John Doe')
    formData.append('signatureDataUrl', 'data:image/png;base64,abc123')

    const result = await saveJobSignature('job123', formData)

    expect(result).toEqual({ success: true })
    expect(db.jobSignature.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org123',
        jobId: 'job123',
        signerName: 'John Doe',
        signatureImageUrl: 'data:image/png;base64,abc123',
      },
    })
    expect(trackEvent).toHaveBeenCalledWith({
      organizationId: 'org123',
      userId: 'user123',
      eventName: 'job_signature_saved',
      entityType: 'job',
      entityId: 'job123',
      metadataJson: { signerName: 'John Doe' },
    })
  })
})