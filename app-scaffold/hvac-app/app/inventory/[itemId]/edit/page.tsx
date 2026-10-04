import { requirePageCapability } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { EditInventoryForm } from './form'

export default async function EditInventoryItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>
}) {
  const { organizationId } = await requirePageCapability('manageInventory')
  const { itemId } = await params

  const item = await db.inventoryItem.findFirst({
    where: { id: itemId, organizationId },
  })

  if (!item) {
    notFound()
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <EditInventoryForm item={item} />
    </main>
  )
}
