import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

function cadenceLabel(cadence: string): string {
  switch (cadence) {
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly'
    case 'biannual': return 'Biannual'
    case 'annual': return 'Annual'
    default: return cadence
  }
}

export default async function MembershipPlansPage() {
  const { organizationId } = await requireActiveSubscription()

  const plans = await db.membershipPlan.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Membership Plans</h1>
        <Link href="/memberships/plans/new" className={cn(buttonVariants(), 'no-underline')}>New plan</Link>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No plans yet. Create a plan to start enrolling customers.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <Card key={plan.id} className={cn(!plan.isActive && 'opacity-60')}>
              <CardContent className="py-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{plan.name}</span>
                    <Badge variant={plan.isActive ? 'default' : 'secondary'}>
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant="outline">{cadenceLabel(plan.cadence)}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground flex gap-4">
                    <span>{plan.visitsPerYear} visits/year</span>
                    <span className="font-medium text-foreground">{formatCents(plan.priceCents)}</span>
                  </div>
                </div>
                {plan.description && (
                  <p className="text-xs text-muted-foreground mt-2">{plan.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
