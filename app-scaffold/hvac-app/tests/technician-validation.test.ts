import { describe, it, expect } from 'vitest'
import {
  createTechnicianSchema,
  updateTechnicianSchema,
  TECHNICIAN_ROLES,
} from '@/lib/validations/technician'

describe('createTechnicianSchema', () => {
  it('accepts valid technician data', () => {
    const result = createTechnicianSchema.safeParse({
      name: 'Jane Rivera',
      email: 'jane@example.com',
      phone: '555-123-4567',
      role: 'lead',
      skills: ['hvac', 'refrigeration'],
    })
    expect(result.success).toBe(true)
  })

  it('requires a name', () => {
    const result = createTechnicianSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('enforces name max length', () => {
    const result = createTechnicianSchema.safeParse({ name: 'A'.repeat(201) })
    expect(result.success).toBe(false)
  })

  it('validates email format', () => {
    const result = createTechnicianSchema.safeParse({
      name: 'Jane',
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('allows empty optional fields', () => {
    const result = createTechnicianSchema.safeParse({
      name: 'Jane',
      email: '',
      phone: '',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown role', () => {
    const result = createTechnicianSchema.safeParse({
      name: 'Jane',
      role: 'supervisor',
    })
    expect(result.success).toBe(false)
  })

  it('accepts every documented role', () => {
    for (const role of TECHNICIAN_ROLES) {
      const result = createTechnicianSchema.safeParse({ name: 'Jane', role })
      expect(result.success).toBe(true)
    }
  })

  it('defaults role, skills, and active when omitted', () => {
    const result = createTechnicianSchema.safeParse({ name: 'Jane' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBe('technician')
      expect(result.data.skills).toEqual([])
      expect(result.data.active).toBe(true)
    }
  })

  it('caps individual skill length', () => {
    const result = createTechnicianSchema.safeParse({
      name: 'Jane',
      skills: ['A'.repeat(51)],
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-array skills', () => {
    const result = createTechnicianSchema.safeParse({
      name: 'Jane',
      skills: 'hvac',
    } as unknown as { name: string; skills: string[] })
    expect(result.success).toBe(false)
  })
})

describe('updateTechnicianSchema', () => {
  it('allows partial updates', () => {
    const result = updateTechnicianSchema.safeParse({ name: 'Updated Name' })
    expect(result.success).toBe(true)
  })

  it('still validates provided fields', () => {
    const result = updateTechnicianSchema.safeParse({ role: 'bogus' })
    expect(result.success).toBe(false)
  })

  it('allows an empty object (no-op update)', () => {
    const result = updateTechnicianSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})
