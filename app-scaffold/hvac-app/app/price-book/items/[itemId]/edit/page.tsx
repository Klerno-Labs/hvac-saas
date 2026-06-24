import { requireAuth } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { PriceBookItemEditForm } from './form'

export default async function EditPriceBookItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>
}) {
  const { organizationId } = await requireAuth()
  const { itemId } = await params

  const item = await db.priceBookItem.findFirst({
    where: { id: itemId, organizationId },
  })

  if (!item) {
    notFound()
  }

  return <PriceBookItemEditForm itemId={item.id} initial={{ name: item.name, category: item.category || '', description: item.description || '', flatPriceCents: item.flatPriceCents, costCents: item.costCents, imageUrl: item.imageUrl || '' }} />
}
