import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    organizationMember: { findFirst: vi.fn() },
    job: { findFirst: vi.fn(), update: vi.fn() },
    jobNote: { upsert: vi.fn() },
  },
}))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('field actions', () => {
  beforeEach(async () => {
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', name: 'Tech One' } } as never)

    const { db } = await import('@/lib/db')
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ organizationId: 'org1' } as never)
    vi.mocked(db.job.findFirst).mockResolvedValue({
      id: 'j1',
      status: 'scheduled',
      completedAt: null,
    } as never)
    vi.mocked(db.job.update).mockResolvedValue({} as never)
    vi.mocked(db.jobNote.upsert).mockResolvedValue({} as never)

    const { trackEvent } = await import('@/lib/events')
    vi.mocked(trackEvent).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('updateFieldJobStatus', () => {
    it('advances status, sets completedAt when completing, and tracks field event', async () => {
      const { updateFieldJobStatus } = await import('@/app/field/actions')
      const { db } = await import('@/lib/db')
      const { trackEvent } = await import('@/lib/events')

      const result = await updateFieldJobStatus('j1', 'in_progress')

      expect(result).toEqual({ success: true })
      expect(vi.mocked(db.job.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'j1' },
          data: expect.objectContaining({ status: 'in_progress' }),
        }),
      )
      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'job_status_updated',
          metadataJson: expect.objectContaining({ source: 'field', from: 'scheduled', to: 'in_progress' }),
        }),
      )
    })

    it('rejects an invalid status without touching the DB', async () => {
      const { updateFieldJobStatus } = await import('@/app/field/actions')
      const { db } = await import('@/lib/db')

      const result = await updateFieldJobStatus('j1', 'draft' as never)

      expect(result).toEqual({ success: false, error: 'Invalid field status' })
      expect(vi.mocked(db.job.update)).not.toHaveBeenCalled()
    })

    it('returns error when unauthenticated', async () => {
      const { auth } = await import('@/lib/auth')
      vi.mocked(auth).mockResolvedValue(null as never)

      const { updateFieldJobStatus } = await import('@/app/field/actions')
      const result = await updateFieldJobStatus('j1', 'in_progress')

      expect(result).toEqual({ success: false, error: 'Not authenticated' })
    })
  })

  describe('addFieldNote', () => {
    it('rejects empty body without touching the DB', async () => {
      const { addFieldNote } = await import('@/app/field/actions')
      const { db } = await import('@/lib/db')

      const result = await addFieldNote('j1', '   ', 'cid-1')

      expect(result).toEqual({ success: false, error: 'Note cannot be empty' })
      expect(vi.mocked(db.jobNote.upsert)).not.toHaveBeenCalled()
    })

    it('upserts note keyed on clientId for idempotency', async () => {
      const { addFieldNote } = await import('@/app/field/actions')
      const { db } = await import('@/lib/db')

      const result = await addFieldNote('j1', 'Refrigerant low', 'cid-abc')

      expect(result).toEqual({ success: true })
      expect(vi.mocked(db.jobNote.upsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'cid-abc' },
          create: expect.objectContaining({
            body: 'Refrigerant low',
            jobId: 'j1',
            organizationId: 'org1',
            authorId: 'u1',
          }),
          update: {},
        }),
      )
    })

    it('trims whitespace from note body', async () => {
      const { addFieldNote } = await import('@/app/field/actions')
      const { db } = await import('@/lib/db')

      await addFieldNote('j1', '  checked filters  ', 'cid-trim')

      expect(vi.mocked(db.jobNote.upsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ body: 'checked filters' }),
        }),
      )
    })
  })
})
