import { describe, it, expect } from 'vitest'
import { createJobSchema } from '@/lib/validations/job'
import { recordProofOfWorkSchema } from '@/lib/validations/proof-of-work'

describe('createJobSchema with optional technicianId', () => {
  it('accepts a job without technicianId', () => {
    const result = createJobSchema.safeParse({ customerId: 'cust_1', title: 'AC Repair' })
    expect(result.success).toBe(true)
  })

  it('accepts a job with technicianId', () => {
    const result = createJobSchema.safeParse({ customerId: 'cust_1', title: 'AC Repair', technicianId: 'tech_abc' })
    expect(result.success).toBe(true)
  })

  it('accepts empty string technicianId (unselected picker)', () => {
    const result = createJobSchema.safeParse({ customerId: 'cust_1', title: 'AC Repair', technicianId: '' })
    expect(result.success).toBe(true)
  })

  it('still requires customerId', () => {
    const result = createJobSchema.safeParse({ title: 'AC Repair', technicianId: 'tech_abc' })
    expect(result.success).toBe(false)
  })
})

describe('recordProofOfWorkSchema with technicianId (not technicianName)', () => {
  it('accepts workSummary with no technicianId', () => {
    const result = recordProofOfWorkSchema.safeParse({ workSummary: 'Replaced capacitor' })
    expect(result.success).toBe(true)
  })

  it('accepts workSummary with technicianId', () => {
    const result = recordProofOfWorkSchema.safeParse({ workSummary: 'Replaced capacitor', technicianId: 'tech_abc' })
    expect(result.success).toBe(true)
  })

  it('accepts empty string technicianId', () => {
    const result = recordProofOfWorkSchema.safeParse({ workSummary: 'Replaced capacitor', technicianId: '' })
    expect(result.success).toBe(true)
  })

  it('rejects missing workSummary', () => {
    const result = recordProofOfWorkSchema.safeParse({ technicianId: 'tech_abc' })
    expect(result.success).toBe(false)
  })

  it('does not accept technicianName (field removed from schema)', () => {
    const parsed = recordProofOfWorkSchema.safeParse({ workSummary: 'Done', technicianName: 'Alice' })
    expect(parsed.success).toBe(true)
    // technicianName is stripped by Zod (unknown key); the parsed output must not contain it
    if (parsed.success) {
      expect('technicianName' in parsed.data).toBe(false)
    }
  })
})
