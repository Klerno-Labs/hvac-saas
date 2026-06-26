import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { cadenceLabel, planPriceLabel } from '@/lib/membership-formatters'

export default async function MembershipPlansPage() {
  const { organizationId } = await requireActiveSubscription()

  const plans = await db.membershipPlan.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Membership Plans</h1>
        <Link href="/memberships/plans/new" className={cn(buttonVariants(), 'no-underline')}>
          New plan
        </Link>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No plans yet. Create one to start enrolling customers.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <Card key={plan.id} className={cn(!plan.isActive && 'opacity-60')}>
              <CardContent className="py-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{plan.name}</span>
                      <Badge variant="outline">{cadenceLabel(plan.cadence)}</Badge>
                      {!plan.isActive && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {plan.visitsPerYear} visits / year
                      {plan.description && <span className="ml-3">{plan.description}</span>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {planPriceLabel(plan.priceCents)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
