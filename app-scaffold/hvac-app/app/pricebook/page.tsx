import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import type { Route } from 'next'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function PriceBookPage() {
  const { organizationId } = await requireActiveSubscription()

  const items = await db.priceBookItem.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { name: 'asc' },
  })

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Price book</h1>
        <div className="flex gap-2">
          <Link href="/pricebook/import" className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}>
            Import CSV
          </Link>
          <Link href={'/pricebook/new' as Route} className={cn(buttonVariants(), 'no-underline')}>
            Add item
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No price book items yet. Add your first item or import a CSV.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <Card key={item.id}>
              <CardContent className="py-4 flex justify-between items-center">
                <div>
                  <p className="font-medium">{item.name}</p>
                  {item.category && <p className="text-sm text-muted-foreground">{item.category}</p>}
                </div>
                <p className="font-medium">${(item.flatPriceCents / 100).toFixed(2)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
