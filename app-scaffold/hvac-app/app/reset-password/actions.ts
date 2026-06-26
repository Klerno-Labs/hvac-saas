'use server'

import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { headers } from 'next/headers'
import { limit } from '@/lib/rate-limit'
import { RL } from '@/lib/rate-limit/config'

type Result = { success: true } | { success: false; error: string }

export async function resetPassword(formData: FormData): Promise<Result> {
  const token = formData.get('token') as string
  const password = formData.get('password') as string

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '127.0.0.1').split(',')[0].trim()
  const r = await limit({ preset: RL.passwordReset, ip, id: token || undefined })
  if (!r.allowed) {
    return { success: false, error: `Too many attempts. Try again in ${r.retryAfterSeconds} seconds.` }
  }

  if (!token || !password) {
    return { success: false, error: 'Token and password are required' }
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
