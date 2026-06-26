import { requireActiveSubscription } from '@/lib/session'
import { getOwnerAnalytics } from '@/lib/owner-analytics'
import { resolvePeriod } from '@/lib/period'
import { formatCents } from '@/lib/format'
import { formatCloseRate } from '@/lib/analytics-presenter'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const PERIOD_LABELS: Record<string, string> = {
  month: 'Month',
  quarter: 'Quarter',
  ytd: 'YTD',
  last30: 'Last 30',
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { organizationId, organization } = await requireActiveSubscription()
  const { period: periodParam } = await searchParams
  const { period, start, end } = resolvePeriod(periodParam)

  const analytics = await getOwnerAnalytics(organizationId, start, end)

  const isEmpty =
    analytics.revenueCents === 0 &&
    analytics.outstandingArCents === 0 &&
    analytics.completedJobs === 0

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">{organization.name}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1 bg-muted/30 w-fit">
          {(['month', 'quarter', 'ytd', 'last30'] as const).map((p) => (
            <Link
              key={p}
              href={`/analytics?period=${p}` as never}
              className={`px-3 py-1 text-sm rounded-md no-underline transition-colors whitespace-nowrap ${
                period === p
                  ? 'bg-background text-foreground font-semibold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {PERIOD_LABELS[p]}
            </Link>
          ))}
        </div>
      </div>

      {isEmpty && (
        <p className="text-sm text-muted-foreground mb-6">
          Once you send invoices and collect payments, your money metrics appear here.
        </p>
      )}

      {/* Headline metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCents(analytics.revenueCents)}</p>
            <p className="text-xs text-muted-foreground mt-1">This period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCents(analytics.avgTicketCents)}</p>
            <p className="text-xs text-muted-foreground mt-1">Per completed job</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Jobs completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{analytics.completedJobs}</p>
            <p className="text-xs text-muted-foreground mt-1">This period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding A/R</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${
                analytics.outstandingArCents > 0 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {formatCents(analytics.outstandingArCents)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">All open invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* A/R aging */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">A/R aging</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Current</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">1–30 days</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">31–60 days</th>
                  <th className="text-left py-2 font-medium text-amber-600">61–90 days</th>
                  <th className="text-left py-2 font-medium text-red-600">90+ days</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-3 font-semibold">
                    {formatCents(analytics.aging.currentCents)}
                  </td>
                  <td className="py-3 font-semibold">
                    {formatCents(analytics.aging.days1to30Cents)}
                  </td>
                  <td className="py-3 font-semibold">
                    {formatCents(analytics.aging.days31to60Cents)}
                  </td>
                  <td
                    className={`py-3 font-semibold ${
                      analytics.aging.days61to90Cents > 0 ? 'text-amber-600' : ''
                    }`}
                  >
                    {formatCents(analytics.aging.days61to90Cents)}
                  </td>
                  <td
                    className={`py-3 font-semibold ${
                      analytics.aging.days90plusCents > 0 ? 'text-red-600' : ''
                    }`}
                  >
                    {formatCents(analytics.aging.days90plusCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Close rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quotes won</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.closeRate.sent === 0 ? (
              <p className="text-sm text-muted-foreground">No estimates sent yet.</p>
            ) : (
              <>
                <p className="text-3xl font-bold">
                  {formatCloseRate(analytics.closeRate.sent, analytics.closeRate.won)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {analytics.closeRate.won} won / {analytics.closeRate.sent} sent
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coming soon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className={analytics.comingSoon.technicianUtilization ? 'opacity-60' : undefined}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Technician utilization</CardTitle>
            {analytics.comingSoon.technicianUtilization && (
              <Badge variant="secondary" className="text-[10px]">
                Coming soon
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Requires timesheet data — not yet collected.
            </p>
          </CardContent>
        </Card>
        <Card className={analytics.comingSoon.jobCostMargin ? 'opacity-60' : undefined}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Job-cost margin</CardTitle>
            {analytics.comingSoon.jobCostMargin && (
              <Badge variant="secondary" className="text-[10px]">
                Coming soon
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Requires labor costs and purchase-order data — not yet collected.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
