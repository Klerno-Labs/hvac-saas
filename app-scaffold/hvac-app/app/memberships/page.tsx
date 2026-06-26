import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function MembershipsPage() {
  const { organizationId } = await requireActiveSubscription()

  const memberships = await db.membership.findMany({
    where: { organizationId },
    include: {
      plan: true,
      customer: { select: { id: true, firstName: true, lastName: true } },
      coveredEquipment: { select: { id: true } },
      recurringJob: { select: { nextDueDate: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  const active = memberships.filter((m) => m.status === 'active')
  const inactive = memberships.filter((m) => m.status !== 'active')

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Memberships</h1>
        <div className="flex gap-2">
          <Link href="/memberships/plans" className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}>Plans</Link>
          <Link href="/memberships/new" className={cn(buttonVariants(), 'no-underline')}>Enroll customer</Link>
        </div>
      </div>

      {memberships.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No memberships yet. Set up a plan and enroll your first customer.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-8">
              <h2 className="text-base font-semibold mb-3">Active ({active.length})</h2>
              <div className="space-y-2">
                {active.map((m) => (
                  <MembershipCard key={m.id} membership={m} />
                ))}
              </div>
            </div>
          )}
          {inactive.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-3 text-muted-foreground">Inactive ({inactive.length})</h2>
              <div className="space-y-2">
                {inactive.map((m) => (
                  <MembershipCard key={m.id} membership={m} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}

type MembershipWithDetails = {
  id: string
  status: string
  visitsUsed: number
  plan: { name: string; cadence: string; visitsPerYear: number }
  customer: { id: string; firstName: string; lastName: string | null }
  coveredEquipment: { id: string }[]
  recurringJob: { nextDueDate: Date } | null
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

function MembershipCard({ membership }: { membership: MembershipWithDetails }) {
  const isActive = membership.status === 'active'

  return (
    <Link href={`/memberships/${membership.id}` as never} className="no-underline text-inherit">
      <Card className={cn(
        'hover:shadow-md transition-shadow cursor-pointer',
        !isActive && 'opacity-60',
      )}>
        <CardContent className="py-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm">{membership.plan.name}</span>
                <Badge variant={isActive ? 'default' : 'secondary'}>
                  {membership.status.charAt(0).toUpperCase() + membership.status.slice(1)}
                </Badge>
                <Badge variant="outline">{cadenceLabel(membership.plan.cadence)}</Badge>
              </div>

              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{membership.visitsUsed} / {membership.plan.visitsPerYear} visits used</span>
                {membership.recurringJob && (
                  <span>Next due: {new Date(membership.recurringJob.nextDueDate).toLocaleDateString()}</span>
                )}
                {membership.coveredEquipment.length > 0 && (
                  <span>{membership.coveredEquipment.length} equipment covered</span>
                )}
              </div>

              <div className="mt-2 text-xs">
                <Link
                  href={`/customers/${membership.customer.id}` as never}
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {membership.customer.firstName} {membership.customer.lastName || ''}
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
