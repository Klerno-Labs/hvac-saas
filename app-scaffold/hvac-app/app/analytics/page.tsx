import { requireActiveSubscription } from '@/lib/session'
import { getOwnerAnalytics } from '@/lib/owner-analytics'
import { resolvePeriod } from '@/lib/period'
import type { Period } from '@/lib/period'
import { formatCents } from '@/lib/format'
import { formatCloseRate } from '@/lib/analytics-presenter'
import Link from 'next/link'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const PERIOD_LABELS: Record<Period, string> = {
  month: 'This Month',
  quarter: 'This Quarter',
  ytd: 'Year to Date',
  last30: 'Last 30 Days',
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'ytd', label: 'YTD' },
  { key: 'last30', label: 'Last 30' },
]

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { organizationId, organization } = await requireActiveSubscription()
  const { period: periodParam } = await searchParams
  const period = resolvePeriod(periodParam)
  const analytics = await getOwnerAnalytics(organizationId, period)

  const isEmpty =
    analytics.revenueCents === 0 &&
    analytics.outstandingCents === 0 &&
    analytics.jobsCompleted === 0

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">{organization.name}</p>
      </div>

      {/* Period switcher */}
      <div className="inline-flex rounded-md border bg-muted p-1 mb-8 gap-1">
        {PERIODS.map(({ key, label }) => (
          <Link
            key={key}
            href={`/analytics?period=${key}` as never}
            className={`px-3 py-1.5 text-sm rounded font-medium no-underline transition-colors ${
              period === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {isEmpty && (
        <p className="text-sm text-muted-foreground mb-6">
          Once you send invoices and collect payments, your money metrics appear here.
        </p>
      )}

      {/* Headline metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue ({PERIOD_LABELS[period]})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCents(analytics.revenueCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCents(analytics.avgTicketCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Jobs completed ({PERIOD_LABELS[period]})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{analytics.jobsCompleted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Outstanding A/R
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${
                analytics.outstandingCents > 0 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {formatCents(analytics.outstandingCents)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* A/R Aging */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">A/R Aging</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left pb-2 font-medium">Bucket</th>
                  <th className="text-right pb-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="py-2">Current</td>
                  <td className="py-2 text-right font-medium">
                    {formatCents(analytics.aging.current)}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="py-2">1–30 days</td>
                  <td className="py-2 text-right font-medium">
                    {formatCents(analytics.aging.days1_30)}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="py-2">31–60 days</td>
                  <td className="py-2 text-right font-medium">
                    {formatCents(analytics.aging.days31_60)}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="py-2 text-amber-600">61–90 days</td>
                  <td className="py-2 text-right font-medium text-amber-600">
                    {formatCents(analytics.aging.days61_90)}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="py-2 font-semibold text-red-600">90+ days</td>
                  <td className="py-2 text-right font-semibold text-red-600">
                    {formatCents(analytics.aging.days90plus)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Close rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quotes won</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.closeRate.sent === 0 ? (
              <p className="text-sm text-muted-foreground">No estimates sent yet.</p>
            ) : (
              <>
                <p className="text-3xl font-bold">
                  {formatCloseRate(analytics.closeRate.rate)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {analytics.closeRate.won} of {analytics.closeRate.sent} estimates accepted
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coming soon */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className={analytics.comingSoon.technicianUtilization ? 'opacity-60' : ''}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Technician utilization
            </CardTitle>
            {analytics.comingSoon.technicianUtilization && (
              <CardAction>
                <Badge variant="secondary">Coming soon</Badge>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {analytics.comingSoon.technicianUtilization && (
              <p className="text-xs text-muted-foreground">
                Requires timesheet data we don&apos;t collect yet.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className={analytics.comingSoon.jobCostMargin ? 'opacity-60' : ''}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Job-cost margin
            </CardTitle>
            {analytics.comingSoon.jobCostMargin && (
              <CardAction>
                <Badge variant="secondary">Coming soon</Badge>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {analytics.comingSoon.jobCostMargin && (
              <p className="text-xs text-muted-foreground">
                Requires labor costs and purchase-order data we don&apos;t collect yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
