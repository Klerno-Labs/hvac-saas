import { requirePageCapability } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function InventoryItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>
}) {
  const { organizationId } = await requirePageCapability('manageInventory')
  const { itemId } = await params

  const item = await db.inventoryItem.findFirst({
    where: { id: itemId, organizationId },
    include: {
      usages: {
        orderBy: { createdAt: 'desc' },
        include: {
          job: { include: { customer: true } },
        },
      },
    },
  })

  if (!item) {
    notFound()
  }

  const belowReorder = item.quantityOnHand <= item.reorderPoint && item.reorderPoint > 0

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <Link href="/inventory" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        &larr; All inventory
      </Link>

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-2xl">{item.name}</CardTitle>
            {item.sku && (
              <p className="text-sm text-muted-foreground">SKU: {item.sku}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {belowReorder && <Badge variant="destructive">Low stock</Badge>}
            <Link
              href={`/inventory/${item.id}/edit` as never}
              className={cn(buttonVariants({ size: 'sm' }), 'no-underline')}
            >
              Edit
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Quantity on hand</p>
              <p className="text-sm font-medium">{item.quantityOnHand}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reorder point</p>
              <p className="text-sm font-medium">{item.reorderPoint}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unit cost</p>
              <p className="text-sm font-medium">${(item.unitCostCents / 100).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sell price</p>
              <p className="text-sm font-medium">${(item.sellPriceCents / 100).toFixed(2)}</p>
            </div>
          </div>

          {item.category && (
            <div>
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="text-sm">{item.category}</p>
            </div>
          )}

          {item.description && (
            <div>
              <p className="text-xs text-muted-foreground">Description</p>
              <p className="text-sm">{item.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold mb-3">Usage history</h2>

      {item.usages.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No usage recorded yet for this item.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {item.usages.map((usage) => (
            <Card key={usage.id}>
              <CardContent className="py-3">
                <div className="flex justify-between items-center">
                  <div>
                    <Link
                      href={`/jobs/${usage.jobId}` as never}
                      className="text-primary hover:underline font-medium text-sm"
                    >
                      {usage.job.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {usage.job.customer.firstName} {usage.job.customer.lastName || ''}
                    </p>
                    {usage.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{usage.notes}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">Qty: {usage.quantity}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(usage.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
