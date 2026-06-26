import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { cadenceLabel, visitsLabel } from '@/lib/membership-formatters'

export default async function MembershipsPage() {
  const { organizationId } = await requireActiveSubscription()

  const memberships = await db.membership.findMany({
    where: { organizationId },
    include: {
      plan: { select: { id: true, name: true, cadence: true, visitsPerYear: true } },
      customer: { select: { id: true, firstName: true, lastName: true } },
      recurringJob: { select: { nextDueDate: true } },
      coveredEquipment: { select: { id: true } },
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
          <Link href="/memberships/plans" className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}>
            Plans
          </Link>
          <Link href="/memberships/new" className={cn(buttonVariants(), 'no-underline')}>
            Enroll customer
          </Link>
        </div>
      </div>

      {memberships.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No memberships yet. Set up a{' '}
              <Link href="/memberships/plans" className="text-primary hover:underline">
                plan
              </Link>{' '}
              then enroll a customer.
            </p>
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
              <h2 className="text-base font-semibold mb-3 text-muted-foreground">
                Paused / Cancelled ({inactive.length})
              </h2>
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

type MembershipRow = {
  id: string
  status: string
  visitsUsed: number
  plan: { id: string; name: string; cadence: string; visitsPerYear: number }
  customer: { id: string; firstName: string; lastName: string | null }
  recurringJob: { nextDueDate: Date } | null
  coveredEquipment: { id: string }[]
}

function MembershipCard({ membership: m }: { membership: MembershipRow }) {
  return (
    <Link href={`/memberships/${m.id}` as never} className="no-underline text-inherit">
      <Card
        className={cn(
          'hover:shadow-md transition-shadow cursor-pointer',
          m.status !== 'active' && 'opacity-60',
        )}
      >
        <CardContent className="py-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm">{m.plan.name}</span>
                <Badge variant={m.status === 'active' ? 'default' : 'secondary'}>
                  {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                </Badge>
                <Badge variant="outline">{cadenceLabel(m.plan.cadence)}</Badge>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{visitsLabel(m.visitsUsed, m.plan.visitsPerYear)}</span>
                {m.recurringJob && (
                  <span>
                    Next due: {new Date(m.recurringJob.nextDueDate).toLocaleDateString()}
                  </span>
                )}
                {m.coveredEquipment.length > 0 && (
                  <span>{m.coveredEquipment.length} equipment</span>
                )}
              </div>
              <div className="mt-2 text-xs">
                <Link
                  href={`/customers/${m.customer.id}` as never}
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {m.customer.firstName} {m.customer.lastName || ''}
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
