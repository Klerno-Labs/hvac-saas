import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { itemToFormState } from '@/lib/pricebook-form'
import { EditPriceBookForm } from './form'

export default async function EditPriceBookItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>
}) {
  const { organizationId } = await requireActiveSubscription()
  const { itemId } = await params

  const item = await db.priceBookItem.findFirst({
    where: { id: itemId, organizationId, deletedAt: null },
    include: { optionGroups: { orderBy: { sortOrder: 'asc' } } },
  })

  if (!item) {
    notFound()
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <EditPriceBookForm itemId={itemId} initialData={itemToFormState(item)} />
    </main>
  )
}
