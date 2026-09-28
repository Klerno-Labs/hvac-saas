'use server'

import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { headers } from 'next/headers'
import { limit, RL, extractIp } from '@/lib/rate-limit'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit/respond'
import { consumePasswordReset, resetTokenDigest } from '@/lib/password-reset'
import { db } from '@/lib/db'
import { passwordSchema } from '@/lib/validations/auth'

type Result = { success: true } | { success: false; error: string }
const schema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid or expired reset link'), password: passwordSchema })

export async function resetPassword(formData: FormData): Promise<Result> {
  const parsed = schema.safeParse({ token: formData.get('token'), password: formData.get('password') })
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }
  const { token, password } = parsed.data
  const guard = await limit({ preset: RL.passwordReset, ip: extractIp(await headers()), id: token })
  try { assertRateLimit(guard) } catch (error) {
    if (error instanceof RateLimitError) return { success: false, error: `Too many attempts. Try again in ${error.retryAfterSeconds}s.` }
    throw error
  }
  try {
    // Reject random or expired capabilities before performing expensive hashing.
    // The transaction still claims it conditionally to close concurrent replay.
    const available = await db.passwordResetToken.findFirst({ where: { token: { in: [resetTokenDigest(token), token] }, usedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } })
    if (!available) return { success: false, error: 'Invalid, expired, or already used reset link. Request a new one.' }
    const hashedPassword = await bcrypt.hash(password, 12)
    if (!await consumePasswordReset(token, hashedPassword)) return { success: false, error: 'Invalid, expired, or already used reset link. Request a new one.' }
    return { success: true }
  } catch {
    return { success: false, error: 'Your password could not be reset. Please try again.' }
  }
}
