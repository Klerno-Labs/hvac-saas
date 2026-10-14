'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createOrganizationSchema } from '@/lib/validations/onboarding'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'

type OnboardingResult =
  | { success: true; organizationId: string }
  | { success: false; error: string }

export async function createOrganization(formData: FormData): Promise<OnboardingResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'You must be logged in' }
  const userId = session.user.id

  const parsed = createOrganizationSchema.safeParse({
    name: formData.get('name'),
    tradeType: formData.get('tradeType') || undefined,
    phone: formData.get('phone') || undefined,
    email: formData.get('email') || undefined,
    timezone: formData.get('timezone') || undefined,
  })
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }
  const { name, tradeType, phone, email, timezone } = parsed.data
  const cookieStore = await cookies()
  const requestedPlan = cookieStore.get('fc_plan')?.value === 'pro' ? 'PRO' : 'STARTER'
  const refCode = cookieStore.get('fc_ref')?.value

  try {
    const result = await db.$transaction(async (tx): Promise<OnboardingResult> => {
      // A retry or a second tab must reuse the first workspace. The user row is
      // stable before onboarding, unlike a membership that does not exist yet.
      const users = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
      if (!users.length) return { success: false, error: 'Your account could not be found. Please log in again.' }
      const existing = await tx.organizationMember.findFirst({ where: { userId } })
      if (existing) return { success: true, organizationId: existing.organizationId }

      const referringOrg = refCode ? await tx.organization.findUnique({ where: { referralCode: refCode } }) : null
      const referredByOrgId = referringOrg?.id ?? null
      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + (referredByOrgId ? 44 : 14))

      await trackEvent({ userId, eventName: 'organization_onboarding_started', entityType: 'user', entityId: userId }, tx)
      const org = await tx.organization.create({
        data: {
          name,
          tradeType,
          phone: phone || null,
          email: email || null,
          timezone: timezone || null,
          onboardingStatus: 'not_started',
          plan: requestedPlan,
          trialEndsAt,
          referralCode: randomBytes(6).toString('hex'),
          referredByOrgId,
        },
      })
      await tx.organizationMember.create({
        data: { organizationId: org.id, userId, role: 'owner', acceptedAt: new Date() },
      })
      if (referredByOrgId) {
        await tx.organization.update({ where: { id: referredByOrgId }, data: { referralCredits: { increment: 1 } } })
      }
      await trackEvent({
        organizationId: org.id,
        userId,
        eventName: 'organization_onboarding_completed',
        metadataJson: { tradeType },
        entityType: 'organization',
        entityId: org.id,
      }, tx)
      return { success: true, organizationId: org.id }
    })

    if (result.success) {
      if (refCode) cookieStore.delete('fc_ref')
      cookieStore.delete('fc_trade')
      cookieStore.delete('fc_plan')
    }
    return result
  } catch (error) {
    console.error('Organization onboarding failed:', error)
    return { success: false, error: 'We could not create your business. Please try again.' }
  }
}
