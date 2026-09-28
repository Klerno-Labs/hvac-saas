import { requirePageCapability } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function InventoryPage() {
  const { organizationId } = await requirePageCapability('manageInventory')

  const items = await db.inventoryItem.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
  })

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
        <Link href="/inventory/new" className={cn(buttonVariants(), 'no-underline')}>
          Add part
        </Link>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No inventory items yet. Add your first part to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const belowReorder = item.quantityOnHand <= item.reorderPoint && item.reorderPoint > 0
            return (
              <Link
                key={item.id}
                href={`/inventory/${item.id}` as never}
                className="no-underline text-inherit"
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div>
                          <span className="font-semibold">{item.name}</span>
                          {item.sku && (
                            <span className="text-muted-foreground ml-2 text-sm">
                              SKU: {item.sku}
                            </span>
                          )}
                        </div>
                        {belowReorder && (
                          <Badge variant="destructive">Low stock</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Qty</p>
                          <p className="font-medium">{item.quantityOnHand}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Cost</p>
                          <p className="font-medium">${(item.unitCostCents / 100).toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Price</p>
                          <p className="font-medium">${(item.sellPriceCents / 100).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                    {item.category && (
                      <p className="text-xs text-muted-foreground mt-1">{item.category}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
