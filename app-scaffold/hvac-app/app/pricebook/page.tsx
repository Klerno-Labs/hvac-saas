import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function PriceBookPage() {
  const { organizationId } = await requireActiveSubscription()

  const items = await db.priceBookItem.findMany({
    where: { organizationId, deletedAt: null },
    include: { optionGroups: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Price Book</h1>
        <Link href="/pricebook/new" className={cn(buttonVariants(), 'no-underline')}>
          Add item
        </Link>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No price-book items yet. Add your first item to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/pricebook/${item.id}/edit` as never}
              className="no-underline text-inherit"
            >
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{item.name}</span>
                      {item.category && (
                        <Badge variant="secondary">{item.category}</Badge>
                      )}
                      {item.optionGroups.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {item.optionGroups
                            .map((g) => g.tier.charAt(0).toUpperCase() + g.tier.slice(1))
                            .join(' / ')}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium">
                      ${(item.flatPriceCents / 100).toFixed(2)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
