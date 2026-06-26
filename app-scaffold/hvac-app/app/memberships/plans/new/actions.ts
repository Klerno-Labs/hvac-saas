'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { createMembershipPlanSchema } from '@/lib/validations/membership'

type Result = { success: true; planId: string } | { success: false; error: string }

export async function createMembershipPlan(formData: FormData): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'You must be logged in' }

  const orgMember = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!orgMember) return { success: false, error: 'You must belong to an organization' }

  const organizationId = orgMember.organizationId

  const raw = {
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    cadence: formData.get('cadence'),
    visitsPerYear: formData.get('visitsPerYear'),
    price: formData.get('price'),
  }

  const parsed = createMembershipPlanSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const { name, description, cadence, visitsPerYear, price } = parsed.data

  const plan = await db.membershipPlan.create({
    data: {
      organizationId,
      name,
      description: description || null,
      cadence,
      visitsPerYear,
      priceCents: Math.round(price * 100),
    },
  })

  return { success: true, planId: plan.id }
}
