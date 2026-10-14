import { db } from '@/lib/db'
import { canDo } from '@/lib/permissions'
import { buildEstimateCatalog } from '@/lib/pricebook-to-lineitem'

/** The caller supplies authenticated server context, never a submitted organization ID. */
export async function getEstimateCatalog(context: { organizationId: string; role: string }) {
  if (!canDo(context.role, 'editPricing')) throw new Error('Pricing access required')
  const { organizationId } = context
  const [services, inventory] = await Promise.all([
    db.priceBookItem.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, description: true, category: true, flatPriceCents: true },
      orderBy: { name: 'asc' },
    }),
    db.inventoryItem.findMany({
      where: { organizationId },
      select: { id: true, name: true, description: true, category: true, sellPriceCents: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return buildEstimateCatalog(services, inventory)
}
