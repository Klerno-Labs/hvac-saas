import { describe, it, expect } from 'vitest'
import {
  createJobSchema,
  assignTechnicianSchema,
  JOB_STATUSES,
  updateJobStatusSchema,
} from '@/lib/validations/job'

describe('createJobSchema', () => {
  const validInput = {
    customerId: 'cus-123',
    title: 'AC unit repair',
  }

  it('accepts valid input without a technician', () => {
    const result = createJobSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.technicianId).toBeUndefined()
    }
  })

  it('accepts a technicianId', () => {
    const result = createJobSchema.safeParse({ ...validInput, technicianId: 'tech-1' })
    expect(result.success).toBe(true)
  })

  it('treats an empty technicianId string as "no technician"', () => {
    const result = createJobSchema.safeParse({ ...validInput, technicianId: '' })
    expect(result.success).toBe(true)
  })

  it('requires a customer', () => {
    const result = createJobSchema.safeParse({ ...validInput, customerId: '' })
    expect(result.success).toBe(false)
  })

  it('requires a title', () => {
    const result = createJobSchema.safeParse({ customerId: 'cus-1', title: '' })
    expect(result.success).toBe(false)
  })

  it('enforces title max length', () => {
    const result = createJobSchema.safeParse({ ...validInput, title: 'A'.repeat(201) })
    expect(result.success).toBe(false)
  })
})

describe('assignTechnicianSchema', () => {
  it('accepts a technicianId', () => {
    expect(assignTechnicianSchema.safeParse({ technicianId: 'tech-1' }).success).toBe(true)
  })

  it('accepts an empty string (clears assignment)', () => {
    expect(assignTechnicianSchema.safeParse({ technicianId: '' }).success).toBe(true)
  })

  it('accepts an omitted technicianId', () => {
    expect(assignTechnicianSchema.safeParse({}).success).toBe(true)
  })
})

describe('updateJobStatusSchema', () => {
  it('accepts every documented status', () => {
    for (const status of JOB_STATUSES) {
      expect(updateJobStatusSchema.safeParse({ status }).success).toBe(true)
    }
  })

  it('rejects an unknown status', () => {
    expect(updateJobStatusSchema.safeParse({ status: 'pending' }).success).toBe(false)
  })
})
