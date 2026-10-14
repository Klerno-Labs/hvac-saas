import { describe, expect, it } from 'vitest'
import { passwordSchema } from '@/lib/validations/auth'
describe('bcrypt password input boundary', () => {
  it('accepts a 72-byte passphrase without truncation', () => expect(passwordSchema.safeParse('a'.repeat(72)).success).toBe(true))
  it('rejects more than 72 bytes, including multibyte characters', () => {
    expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false)
    expect(passwordSchema.safeParse('😀'.repeat(19)).success).toBe(false)
  })
  it('does not silently trim or normalize a password', () => expect(passwordSchema.parse('  My Password  ')).toBe('  My Password  '))
})
