'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createOptionGroupSchema, OPTION_TIERS, type OptionTier } from '@/lib/validations/price-book'

type CreateOptionGroupResult =
  | { success: true; groupId: string }
  | { success: false; error: string }

const TIER_ORDER: Record<OptionTier, number> = { good: 0, better: 1, best: 2 }

export async function createOptionGroup(input: {
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
}): Promise<CreateOptionGroupResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const userId = session.user.id

  const membership = await db.organizationMember.findFirst({
    where: { userId },
  })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }

  const organizationId = membership.organizationId

  const parsed = createOptionGroupSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  // Sort tiers in canonical good/better/best order for stable display.
  const optionsSorted = [...data.options].sort(
    (a, b) =>
      (TIER_ORDER[a.tier as OptionTier] ?? 99) - (TIER_ORDER[b.tier as OptionTier] ?? 99),
  )

  const group = await db.optionGroup.create({
    data: {
      organizationId,
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

  await trackEvent({
    organizationId,
    userId,
    eventName: 'option_group_created',
    entityType: 'option_group',
    entityId: group.id,
    metadataJson: { tiers: optionsSorted.map((o) => o.tier).filter((t): t is OptionTier => (OPTION_TIERS as readonly string[]).includes(t)) },
  })

  return { success: true, groupId: group.id }
}
