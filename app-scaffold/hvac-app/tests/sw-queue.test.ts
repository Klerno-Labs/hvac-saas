import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { updateJobStatusSchema } from '@/lib/validations/job'
import { recordProofOfWorkSchema } from '@/lib/validations/proof-of-work'

// Mirror of the discriminated union in app/api/field-queue/route.ts
const jobStatusWriteSchema = z.object({
  type: z.literal('job_status'),
  jobId: z.string().min(1),
  status: z.string(),
})

const jobNotesWriteSchema = z.object({
  type: z.literal('job_notes'),
  jobId: z.string().min(1),
  workSummary: z.string().min(1),
  materialsUsed: z.string().optional(),
  completionNotes: z.string().optional(),
  technicianName: z.string().optional(),
})

const fieldWriteSchema = z.discriminatedUnion('type', [jobStatusWriteSchema, jobNotesWriteSchema])

describe('fieldWriteSchema', () => {
  it('accepts a valid job_status write', () => {
    expect(
      fieldWriteSchema.safeParse({ type: 'job_status', jobId: 'job-1', status: 'in_progress' }).success
    ).toBe(true)
  })

  it('accepts a valid job_notes write with only workSummary', () => {
    expect(
      fieldWriteSchema.safeParse({ type: 'job_notes', jobId: 'job-1', workSummary: 'Replaced capacitor' }).success
    ).toBe(true)
  })

  it('accepts job_notes with all optional fields', () => {
    expect(
      fieldWriteSchema.safeParse({
        type: 'job_notes',
        jobId: 'job-1',
        workSummary: 'Full tune-up',
        materialsUsed: 'Filter x2',
        completionNotes: 'Left receipt',
        technicianName: 'Alice',
      }).success
    ).toBe(true)
  })

  it('rejects job_status with empty jobId', () => {
    expect(
      fieldWriteSchema.safeParse({ type: 'job_status', jobId: '', status: 'completed' }).success
    ).toBe(false)
  })

  it('rejects job_notes with empty workSummary', () => {
    expect(
      fieldWriteSchema.safeParse({ type: 'job_notes', jobId: 'job-1', workSummary: '' }).success
    ).toBe(false)
  })

  it('rejects an unknown write type', () => {
    expect(
      fieldWriteSchema.safeParse({ type: 'job_delete', jobId: 'job-1' }).success
    ).toBe(false)
  })
})

describe('updateJobStatusSchema (used to re-validate job_status writes at sync time)', () => {
  it('accepts all valid statuses', () => {
    for (const s of ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']) {
      expect(updateJobStatusSchema.safeParse({ status: s }).success).toBe(true)
    }
  })

  it('rejects an unrecognised status', () => {
    expect(updateJobStatusSchema.safeParse({ status: 'pending' }).success).toBe(false)
  })
})

describe('recordProofOfWorkSchema (used to re-validate job_notes writes at sync time)', () => {
  it('requires workSummary', () => {
    expect(recordProofOfWorkSchema.safeParse({ workSummary: '' }).success).toBe(false)
  })

  it('accepts minimal valid data', () => {
    expect(recordProofOfWorkSchema.safeParse({ workSummary: 'Done' }).success).toBe(true)
  })
})
