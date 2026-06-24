'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { updateOptionGroupSchema, OPTION_TIERS, type OptionTier } from '@/lib/validations/price-book'

type ActionResult =
  | { success: true; groupId?: string }
  | { success: false; error: string }

const TIER_ORDER: Record<OptionTier, number> = { good: 0, better: 1, best: 2 }

export async function updateOptionGroup(
  groupId: string,
  input: {
    name: string
    category?: string
    description?: string
    options: {
      tier: string
      name: string
      description?: string
      priceCents: number
      costCents?: number
      imageUrl?: string
    }[]
  },
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'You must be logged in' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { success: false, error: 'You must belong to an organization' }

  const organizationId = membership.organizationId

  const group = await db.optionGroup.findFirst({
    where: { id: groupId, organizationId },
  })
  if (!group) return { success: false, error: 'Option group not found' }

  const parsed = updateOptionGroupSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data

  const optionsSorted = [...data.options].sort(
    (a, b) =>
      (TIER_ORDER[a.tier as OptionTier] ?? 99) - (TIER_ORDER[b.tier as OptionTier] ?? 99),
  )

  // Replace options wholesale: delete then re-create. Option rows are leaf
  // records (no inbound FKs), so this is safe and keeps sortOrder consistent.
  await db.$transaction(async (tx) => {
    await tx.optionGroupOption.deleteMany({ where: { optionGroupId: groupId } })
    await tx.optionGroup.update({
      where: { id: groupId },
      data: {
        name: data.name,
        category: data.category || null,
        description: data.description || null,
        options: {
          create: optionsSorted.map((opt, index) => ({
            organizationId,
            tier: opt.tier,
            name: opt.name,
            description: opt.description || null,
            priceCents: opt.priceCents,
            costCents: opt.costCents,
            imageUrl: opt.imageUrl || null,
            sortOrder: index,
          })),
        },
      },
    })
  })

  await trackEvent({
    organizationId,
    userId: session.user.id,
    eventName: 'option_group_updated',
    entityType: 'option_group',
    entityId: groupId,
    metadataJson: { tiers: optionsSorted.map((o) => o.tier).filter((t): t is OptionTier => (OPTION_TIERS as readonly string[]).includes(t)) },
  })

  return { success: true, groupId }
}

export async function deleteOptionGroup(groupId: string): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'You must be logged in' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { success: false, error: 'You must belong to an organization' }

  const group = await db.optionGroup.findFirst({
    where: { id: groupId, organizationId: membership.organizationId },
  })
  if (!group) return { success: false, error: 'Option group not found' }

  await db.optionGroup.delete({ where: { id: groupId } })

  await trackEvent({
    organizationId: membership.organizationId,
    userId: session.user.id,
    eventName: 'option_group_deleted',
    entityType: 'option_group',
    entityId: groupId,
  })

  return { success: true }
}
