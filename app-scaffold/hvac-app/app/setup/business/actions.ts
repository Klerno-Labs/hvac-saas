'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireMutationAccess } from '@/lib/mutation-access'
import { businessProfileSchema } from '@/lib/validations/business-profile'
import { diffSummary, logAudit } from '@/lib/audit'

export async function saveBusinessProfile(input: unknown): Promise<{ success: true } | { success: false; error: string }> {
  const access = await requireMutationAccess('manageBilling')
  if (!access.authorized) return { success: false, error: access.error }
  const parsed = businessProfileSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }
  const { organizationId, userId, userEmail } = access.context
  const data = { ...parsed.data, phone: parsed.data.phone || null, email: parsed.data.email || null }
  try {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
      const previous = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, tradeType: true, timezone: true, phone: true, email: true } })
      const changes = diffSummary(previous, data)
      if (!changes.length) return
      await tx.organization.update({ where: { id: organizationId }, data })
      await logAudit({ organizationId, actorId: userId, actorEmail: userEmail ?? undefined,
        eventType: 'business_profile_updated', targetType: 'organization', targetId: organizationId, metadata: { changes } }, tx)
    })
  } catch {
    return { success: false, error: 'Your business details could not be saved. Please try again.' }
  }
  revalidatePath('/', 'layout')
  return { success: true }
}
