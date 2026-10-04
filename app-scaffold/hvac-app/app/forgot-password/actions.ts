'use server'

import { db } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { headers } from 'next/headers'
import { limit, RL, extractIp } from '@/lib/rate-limit'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit/respond'
import { resetTokenDigest } from '@/lib/password-reset'

type Result = { success: true } | { success: false; error: string }

export async function requestPasswordReset(formData: FormData): Promise<Result> {
  const parsed = z.string().trim().toLowerCase().email('Enter a valid email address').max(254).safeParse(formData.get('email'))
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }
  const normalizedEmail = parsed.data
  const guard = await limit({ preset: RL.passwordReset, ip: extractIp(await headers()), id: normalizedEmail })
  try { assertRateLimit(guard) } catch (error) {
    if (error instanceof RateLimitError) return { success: false, error: `Too many attempts. Try again in ${error.retryAfterSeconds}s.` }
    throw error
  }
  // A global configuration failure is safe to report without revealing accounts.
  if (!process.env.RESEND_API_KEY) return { success: false, error: 'Password reset email is temporarily unavailable. Please contact support.' }
  const user = await db.user.findFirst({ where: { email: { equals: normalizedEmail, mode: 'insensitive' } } })
  if (!user?.email) return { success: true }
  const token = randomBytes(32).toString('hex')
  const storedToken = resetTokenDigest(token)
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`
    await tx.passwordResetToken.updateMany({ where: { email: user.email!, usedAt: null }, data: { usedAt: new Date() } })
    await tx.passwordResetToken.create({ data: { token: storedToken, email: user.email!, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } })
  })
  const appUrl = process.env.APP_URL || 'https://app.fieldclose.app'
  try {
    const delivery = await sendPasswordResetEmail({ to: user.email, resetUrl: `${appUrl}/reset-password?token=${token}` })
    if (!delivery.success) {
      await db.passwordResetToken.updateMany({ where: { token: storedToken, usedAt: null }, data: { usedAt: new Date() } })
      console.error('Password reset email delivery failed')
    }
  } catch {
    await db.passwordResetToken.updateMany({ where: { token: storedToken, usedAt: null }, data: { usedAt: new Date() } })
    console.error('Password reset email delivery failed')
  }
  // Matching and nonmatching addresses get the same response, including when a
  // provider rejects a recipient. The UI does not claim confirmed delivery.
  return { success: true }
}
