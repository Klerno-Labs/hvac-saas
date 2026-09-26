'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { signupSchema } from '@/lib/validations/auth'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { isTradeId } from '@/lib/trades'

type SignupResult =
  | { success: true }
  | { success: false; error: string }

export async function signup(formData: FormData): Promise<SignupResult> {
  const raw = {
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  }

  const parsed = signupSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const { name, email, password } = parsed.data

  // Persist referral code from form (passed via hidden input) into a cookie
  // that survives until onboarding completes
  const ref = formData.get('ref')
  if (typeof ref === 'string' && ref.length > 0 && ref.length < 100) {
    const cookieStore = await cookies()
    cookieStore.set('fc_ref', ref, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
  }

  const existing = await db.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
  if (existing) {
    return { success: false, error: 'An account with this email already exists' }
  }

  const hashedPassword = await bcrypt.hash(password, 12)

  const user = await db.user.create({
    data: {
      name,
      email,
      hashedPassword,
    },
  })

  const requestedTrade = formData.get('trade')
  const cookieStore = await cookies()
  cookieStore.set('fc_trade', isTradeId(requestedTrade) ? requestedTrade : 'hvac', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  await trackEvent({
    userId: user.id,
    eventName: 'user_signed_up',
    entityType: 'user',
    entityId: user.id,
  })

  return { success: true }
}
