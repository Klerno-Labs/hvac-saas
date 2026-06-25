import { describe, it, expect } from 'vitest'
import { assignJobSchema } from '@/lib/validations/dispatch'

describe('assignJobSchema', () => {
  it('accepts a valid assignment', () => {
    const result = assignJobSchema.safeParse({
      jobId: 'clxyz123',
      technicianId: 'user456',
      scheduledFor: '2024-06-15T09:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })

  it('accepts null technicianId and scheduledFor (unassign)', () => {
    const result = assignJobSchema.safeParse({
      jobId: 'clxyz123',
      technicianId: null,
      scheduledFor: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty jobId', () => {
    const result = assignJobSchema.safeParse({
      jobId: '',
      technicianId: null,
      scheduledFor: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-datetime scheduledFor', () => {
    const result = assignJobSchema.safeParse({
      jobId: 'clxyz123',
      technicianId: 'user456',
      scheduledFor: 'tomorrow at 9am',
    })
    expect(result.success).toBe(false)
  })
})
