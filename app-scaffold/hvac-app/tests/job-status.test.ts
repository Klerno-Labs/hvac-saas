import { describe, it, expect } from 'vitest'
import { JOB_STATUSES, updateJobStatusSchema } from '@/lib/validations/job'

describe('updateJobStatusSchema', () => {
  it("accepts 'booked'", () => {
    expect(updateJobStatusSchema.safeParse({ status: 'booked' }).success).toBe(true)
  })

  it("accepts all legacy statuses", () => {
    const legacyStatuses = ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'] as const
    for (const status of legacyStatuses) {
      expect(updateJobStatusSchema.safeParse({ status }).success).toBe(true)
    }
  })

  it("rejects an unknown status", () => {
    expect(updateJobStatusSchema.safeParse({ status: 'xyz' }).success).toBe(false)
  })

  it("JOB_STATUSES tuple contains 'booked' between 'draft' and 'scheduled'", () => {
    const draft = JOB_STATUSES.indexOf('draft')
    const booked = JOB_STATUSES.indexOf('booked')
    const scheduled = JOB_STATUSES.indexOf('scheduled')
    expect(booked).toBeGreaterThan(draft)
    expect(booked).toBeLessThan(scheduled)
  })
})
