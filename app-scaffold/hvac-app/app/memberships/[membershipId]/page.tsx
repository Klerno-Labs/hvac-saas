import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MembershipActionButtons } from './action-buttons'

function cadenceLabel(cadence: string): string {
  switch (cadence) {
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly'
    case 'biannual': return 'Biannual'
    case 'annual': return 'Annual'
    default: return cadence
  }
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

export default async function MembershipDetailPage({
  params,
}: {
  params: Promise<{ membershipId: string }>
}) {
  const { membershipId } = await params
  const { organizationId } = await requireActiveSubscription()

  const membership = await db.membership.findFirst({
    where: { id: membershipId, organizationId },
    include: {
      plan: true,
      customer: { select: { id: true, firstName: true, lastName: true } },
      recurringJob: { select: { id: true, nextDueDate: true } },
      coveredEquipment: { select: { id: true, type: true, make: true, model: true, serial: true } },
    },
  })

  if (!membership) notFound()

  const isActive = membership.status === 'active'
  const isPaused = membership.status === 'paused'

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
        <Link href="/memberships" className="hover:text-foreground">Memberships</Link>
        <span>/</span>
        <span className="text-foreground">{membership.plan.name}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold tracking-tight">{membership.plan.name}</h1>
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {membership.status.charAt(0).toUpperCase() + membership.status.slice(1)}
            </Badge>
            <Badge variant="outline">{cadenceLabel(membership.plan.cadence)}</Badge>
          </div>
        </div>

        <MembershipActionButtons
          membershipId={membership.id}
          isActive={isActive}
          isPaused={isPaused}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cadence</span>
              <span className="font-medium">{cadenceLabel(membership.plan.cadence)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Visits</span>
              <span className="font-medium">{membership.visitsUsed} / {membership.plan.visitsPerYear} used</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium">{formatCents(membership.plan.priceCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start date</span>
              <span className="font-medium">{new Date(membership.startDate).toLocaleDateString()}</span>
            </div>
            {membership.endDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">End date</span>
                <span className="font-medium">{new Date(membership.endDate).toLocaleDateString()}</span>
              </div>
            )}
            {membership.recurringJob && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Next due</span>
                <Link
                  href={`/recurring/${membership.recurringJob.id}` as never}
                  className="text-primary hover:underline font-medium"
                >
                  {new Date(membership.recurringJob.nextDueDate).toLocaleDateString()}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <Link
                href={`/customers/${membership.customer.id}` as never}
                className="text-primary hover:underline font-medium"
              >
                {membership.customer.firstName} {membership.customer.lastName || ''}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {membership.coveredEquipment.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Covered equipment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {membership.coveredEquipment.map((eq) => (
                <div key={eq.id} className="flex items-center justify-between p-3 rounded-md border text-sm">
                  <div>
                    <span className="font-medium">{eq.type}</span>
                    {eq.make && <span className="text-muted-foreground ml-2">{eq.make}</span>}
                    {eq.model && <span className="text-muted-foreground ml-1">{eq.model}</span>}
                  </div>
                  {eq.serial && (
                    <span className="text-xs text-muted-foreground">S/N: {eq.serial}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
