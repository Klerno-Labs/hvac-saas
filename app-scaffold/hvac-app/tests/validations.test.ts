import { describe, it, expect } from 'vitest'
import { createCustomerSchema, updateCustomerSchema } from '@/lib/validations/customer'
import { updateJobStatusSchema, JOB_STATUSES } from '@/lib/validations/job'

describe('createCustomerSchema', () => {
  it('accepts valid customer data', () => {
    const result = createCustomerSchema.safeParse({
      firstName: 'John',
      lastName: 'Doe',
      phone: '555-555-5555',
      email: 'john@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('requires firstName', () => {
    const result = createCustomerSchema.safeParse({
      firstName: '',
      phone: '555-555-5555',
    })
    expect(result.success).toBe(false)
  })

  it('requires phone', () => {
    const result = createCustomerSchema.safeParse({
      firstName: 'John',
      phone: '',
    })
    expect(result.success).toBe(false)
  })

  it('validates email format', () => {
    const result = createCustomerSchema.safeParse({
      firstName: 'John',
      phone: '555-555-5555',
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('allows empty optional fields', () => {
    const result = createCustomerSchema.safeParse({
      firstName: 'Jane',
      phone: '555-123-4567',
      lastName: '',
      email: '',
      companyName: '',
      notes: '',
    })
    expect(result.success).toBe(true)
  })

  it('enforces max lengths', () => {
    const result = createCustomerSchema.safeParse({
      firstName: 'A'.repeat(101),
      phone: '555-555-5555',
    })
    expect(result.success).toBe(false)
  })
})

describe('updateCustomerSchema', () => {
  it('uses the same rules as createCustomerSchema', () => {
    const valid = updateCustomerSchema.safeParse({
      firstName: 'Updated',
      phone: '555-999-0000',
    })
    expect(valid.success).toBe(true)

    const invalid = updateCustomerSchema.safeParse({
      firstName: '',
      phone: '555-999-0000',
    })
    expect(invalid.success).toBe(false)
  })
})

describe('updateJobStatusSchema', () => {
  it('accepts booked', () => {
    expect(updateJobStatusSchema.safeParse({ status: 'booked' }).success).toBe(true)
  })

  it('accepts all legacy statuses', () => {
    for (const status of JOB_STATUSES) {
      expect(updateJobStatusSchema.safeParse({ status }).success).toBe(true)
    }
  })

  it('rejects unknown status', () => {
    expect(updateJobStatusSchema.safeParse({ status: 'xyz' }).success).toBe(false)
  })
})
