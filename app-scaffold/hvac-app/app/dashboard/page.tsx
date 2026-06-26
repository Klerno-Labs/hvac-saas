import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GettingStartedChecklist } from '@/app/components/getting-started-checklist'

export default async function DashboardPage() {
  const { organization, organizationId } = await requireActiveSubscription()

  const [
    customerCount,
    activeJobCount,
    completedJobCount,
    outstandingInvoices,
    overdueInvoices,
    stalledJobCount,
    newBookingCount,
  ] = await Promise.all([
    db.customer.count({ where: { organizationId } }),
    db.job.count({ where: { organizationId, status: { in: ['draft', 'scheduled', 'in_progress'] } } }),
    db.job.count({ where: { organizationId, status: 'completed' } }),
    db.invoice.findMany({
      where: { organizationId, status: { notIn: ['paid', 'void'] } },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.invoice.findMany({
      where: { organizationId, status: 'sent', dueDate: { lt: new Date() } },
      include: { customer: true },
      take: 5,
    }),
    db.job.count({
      where: {
        organizationId,
        status: 'in_progress',
        updatedAt: { lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      },
    }),
    db.bookingRequest.count({ where: { organizationId, status: 'new' } }),
  ])

  const totalOutstandingCents = outstandingInvoices.reduce((sum, inv) => sum + inv.outstandingCents, 0)

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{organization.name}</p>
      </div>

      {organization.onboardingStatus !== 'completed' && (
        <GettingStartedChecklist organizationId={organizationId} />
      )}

      {/* Metric cards — 3 headline numbers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Link href="/customers" className="no-underline text-inherit">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{customerCount}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/jobs" className="no-underline text-inherit">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{activeJobCount}</p>
              <p className="text-xs text-muted-foreground mt-1">{completedJobCount} completed</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/invoices" className="no-underline text-inherit">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${totalOutstandingCents > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {formatCents(totalOutstandingCents)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {outstandingInvoices.length} invoice{outstandingInvoices.length !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Stripe status — single narrow card, not a row */}
      <div className="mb-8 max-w-xs">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stripe</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={organization.stripeChargesEnabled ? 'default' : 'secondary'}>
              {organization.stripeChargesEnabled ? 'Connected' : 'Not connected'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Weekly habit nudge — stalled jobs (no update in 3+ days) */}
      {stalledJobCount > 0 && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {stalledJobCount} job{stalledJobCount !== 1 ? 's' : ''} in progress with no update in 3+ days.{' '}
          <Link href="/jobs" className="underline font-medium">Review jobs →</Link>
        </div>
      )}

      {/* New booking requests nudge */}
      {newBookingCount > 0 && (
        <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300 flex items-center justify-between">
          <span>
            {newBookingCount} new booking request{newBookingCount !== 1 ? 's' : ''} awaiting review.
          </span>
          <Link href="/bookings" className="underline font-medium ml-2 whitespace-nowrap">Review →</Link>
        </div>
      )}

      {/* Needs attention — overdue invoices only */}
      {overdueInvoices.length > 0 && (
        <Card className="mb-6 border-l-4 border-l-amber-500">
          <CardHeader>
            <CardTitle className="text-lg">Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-semibold mb-2">Overdue invoices</p>
              {overdueInvoices.map((inv) => (
                <Link key={inv.id} href={`/invoices/${inv.id}` as never} className="no-underline text-inherit">
                  <div className="flex justify-between py-2 border-b cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded">
                    <span className="text-sm">#{inv.invoiceNumber} — {inv.customer.firstName} {inv.customer.lastName || ''}</span>
                    <span className="text-sm font-semibold text-amber-600">{formatCents(inv.outstandingCents)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outstanding invoices — full width */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Outstanding invoices</CardTitle>
          <Link href="/invoices" className="text-xs text-muted-foreground hover:underline">View all</Link>
        </CardHeader>
        <CardContent>
          {outstandingInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outstanding invoices.</p>
          ) : (
            outstandingInvoices.map((inv) => (
              <Link key={inv.id} href={`/invoices/${inv.id}` as never} className="no-underline text-inherit">
                <div className="flex justify-between items-center py-2 border-b cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded">
                  <div>
                    <span className="text-sm font-medium">#{inv.invoiceNumber}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {inv.customer.firstName} {inv.customer.lastName || ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{formatCents(inv.outstandingCents)}</span>
                    <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
                  </div>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}
