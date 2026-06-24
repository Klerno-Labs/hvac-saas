import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TIER_LABELS, type OptionTier } from '@/lib/validations/price-book'

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

export default async function PriceBookPage() {
  const { organizationId } = await requireActiveSubscription()

  const [items, groups] = await Promise.all([
    db.priceBookItem.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    }),
    db.optionGroup.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    }),
  ])

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Price book</h1>
        <div className="flex gap-2">
          <Link href="/price-book/groups/new" className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}>
            New option group
          </Link>
          <Link href="/price-book/items/new" className={cn(buttonVariants(), 'no-underline')}>
            New item
          </Link>
        </div>
      </div>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Flat-rate items</h2>
        {items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                No price book items yet. Add a flat-rate service or part to reuse on estimates.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/price-book/items/${item.id}/edit` as never}
                className="no-underline text-inherit"
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold">{item.name}</span>
                        {item.category && (
                          <span className="text-muted-foreground ml-2 text-sm">{item.category}</span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCents(item.flatPriceCents)}</p>
                        {item.costCents != null && (
                          <p className="text-xs text-muted-foreground">cost {formatCents(item.costCents)}</p>
                        )}
                      </div>
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Good / Better / Best option groups</h2>
        {groups.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                No option groups yet. Build a good/better/best bundle to drop tiers onto estimates.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <Link
                key={group.id}
                href={`/price-book/groups/${group.id}/edit` as never}
                className="no-underline text-inherit"
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-semibold">{group.name}</span>
                        {group.category && (
                          <span className="text-muted-foreground ml-2 text-sm">{group.category}</span>
                        )}
                        {group.description && (
                          <p className="text-xs text-muted-foreground mt-1">{group.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        {group.options.map((opt) => (
                          <Badge
                            key={opt.id}
                            className={tierClass(opt.tier as OptionTier)}
                            title={TIER_LABELS[opt.tier as OptionTier]}
                          >
                            {TIER_LABELS[opt.tier as OptionTier] ?? opt.tier}: {formatCents(opt.priceCents)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function tierClass(tier: OptionTier): string {
  switch (tier) {
    case 'good': return 'bg-gray-500 text-white'
    case 'better': return 'bg-blue-600 text-white'
    case 'best': return 'bg-emerald-600 text-white'
    default: return 'bg-gray-500 text-white'
  }
}
