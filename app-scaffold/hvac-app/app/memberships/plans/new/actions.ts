'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createMembershipPlanSchema } from '@/lib/validations/membership'
import { logAudit } from '@/lib/audit'

type CreatePlanResult =
  | { success: true; planId: string }
  | { success: false; error: string }

export async function createMembershipPlan(formData: FormData): Promise<CreatePlanResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }
  const organizationId = membership.organizationId

  const raw = {
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    termMonths: Number(formData.get('termMonths')),
    visitFrequency: formData.get('visitFrequency'),
    includedVisitsPerTerm: Number(formData.get('includedVisitsPerTerm')),
    priceCents: Number(formData.get('priceCentsDollars')) * 100,
  }

  const parsed = createMembershipPlanSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }
  const data = parsed.data

  const plan = await db.membershipPlan.create({
    data: {
      organizationId,
      name: data.name,
      description: data.description ?? null,
      termMonths: data.termMonths,
      visitFrequency: data.visitFrequency,
      includedVisitsPerTerm: data.includedVisitsPerTerm,
      priceCents: data.priceCents,
      isActive: true,
    },
  })

  await trackEvent({
    organizationId,
    userId: session.user.id,
    eventName: 'membership_plan_created',
    entityType: 'membership_plan',
    entityId: plan.id,
    metadataJson: { name: plan.name, visitFrequency: plan.visitFrequency },
  })
  await logAudit({
    organizationId,
    actorId: session.user.id,
    eventType: 'membership_plan_created',
    targetType: 'membership_plan',
    targetId: plan.id,
    metadata: { name: plan.name },
  })

  return { success: true, planId: plan.id }
}
