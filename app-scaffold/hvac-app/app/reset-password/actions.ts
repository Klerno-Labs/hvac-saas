'use server'

import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { headers } from 'next/headers'
import { limit, RL, extractIp } from '@/lib/rate-limit'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit/respond'

type Result = { success: true } | { success: false; error: string }

export async function resetPassword(formData: FormData): Promise<Result> {
  const token = formData.get('token') as string
  const password = formData.get('password') as string

  if (!token || !password) {
    return { success: false, error: 'Token and password are required' }
  }

  const ip = extractIp(await headers())
  const guard = await limit({ preset: RL.passwordReset, ip, id: token })
  try {
    assertRateLimit(guard)
  } catch (e) {
    if (e instanceof RateLimitError) {
      return { success: false, error: `Too many attempts. Try again in ${e.retryAfterSeconds}s.` }
    }
    throw e
  }

  if (password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' }
  }

  const resetToken = await db.passwordResetToken.findUnique({ where: { token } })

  if (!resetToken) {
    return { success: false, error: 'Invalid or expired reset link' }
  }

  if (resetToken.usedAt) {
    return { success: false, error: 'This reset link has already been used' }
  }

  if (resetToken.expiresAt < new Date()) {
    return { success: false, error: 'This reset link has expired' }
  }

  const user = await db.user.findUnique({ where: { email: resetToken.email } })
  if (!user) {
    return { success: false, error: 'Account not found' }
  }

  const hashedPassword = await bcrypt.hash(password, 12)

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { hashedPassword },
    }),
    db.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ])

  return { success: true }
}
