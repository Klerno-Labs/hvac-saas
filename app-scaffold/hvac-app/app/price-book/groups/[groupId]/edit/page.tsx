import { requireAuth } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { OptionGroupForm } from '../form'

export default async function EditOptionGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { organizationId } = await requireAuth()
  const { groupId } = await params

  const group = await db.optionGroup.findFirst({
    where: { id: groupId, organizationId },
    include: { options: { orderBy: { sortOrder: 'asc' } } },
  })

  if (!group) {
    notFound()
  }

  return (
    <OptionGroupForm
      mode="edit"
      groupId={group.id}
      initial={{
        name: group.name,
        category: group.category || '',
        description: group.description || '',
        options: group.options.map((o) => ({
          id: o.id,
          tier: o.tier,
          name: o.name,
          description: o.description,
          priceCents: o.priceCents,
          costCents: o.costCents,
        })),
      }}
    />
  )
}
