import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { calculateAverageTicket, calculateARAging, getDateRange } from '@/lib/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type PeriodKey = '7d' | '30d' | '90d' | 'all'

interface AnalyticsData {
  revenueByPeriod: Record<PeriodKey, number>
  averageTicket: Record<PeriodKey, number>
  arAging: {
    current: number
    overdue1: number
    overdue2: number
    overdue3: number
  }
  closeRate: {
    sent: number
    accepted: number
    rate: number
  }
  jobsCompleted: Record<PeriodKey, number>
  outstanding: number
}

function getDateRange(period: PeriodKey): { start: Date; end: Date } {
  const end = new Date()
  const start = new Date()
  
  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7)
      break
    case '30d':
      start.setDate(start.getDate() - 30)
      break
    case '90d':
      start.setDate(start.getDate() - 90)
      break
    case 'all':
      start.setFullYear(start.getFullYear() - 10)
      break
  }
  
  return { start, end }
}

export { calculateAverageTicket, calculateARAging, getDateRange }

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { organizationId, organization } = await requireActiveSubscription()
  const params = await searchParams
  const period = (params.period as PeriodKey) || '30d'

  const { start: periodStart, end: periodEnd } = getDateRange(period)

  const [
    paidInvoices,
    allPaidInvoices,
    outstandingInvoices,
    sentEstimates,
    acceptedEstimates,
    completedJobs,
  ] = await Promise.all([
    db.invoice.findMany({
      where: {
        organizationId,
        status: 'paid',
        paidAt: { gte: periodStart, lte: periodEnd },
      },
      select: { totalCents: true, paidAt: true },
    }),
    db.invoice.findMany({
      where: {
        organizationId,
        status: 'paid',
      },
      select: { totalCents: true, paidAt: true },
    }),
    db.invoice.findMany({
      where: {
        organizationId,
        status: { notIn: ['paid', 'void'] },
      },
      select: { outstandingCents: true, dueDate: true },
    }),
    db.estimate.count({
      where: {
        organizationId,
        status: 'sent',
        sentAt: { not: null },
      },
    }),
    db.estimate.count({
      where: {
        organizationId,
        status: 'accepted',
        acceptedAt: { not: null },
      },
    }),
    db.job.count({
      where: {
        organizationId,
        status: 'completed',
        completedAt: { gte: periodStart, lte: periodEnd },
      },
    }),
  ])

  const analytics: AnalyticsData = {
    revenueByPeriod: {
      '7d': paidInvoices
        .filter(inv => inv.paidAt && inv.paidAt >= getDateRange('7d').start)
        .reduce((sum, inv) => sum + inv.totalCents, 0),
      '30d': paidInvoices
        .filter(inv => inv.paidAt && inv.paidAt >= getDateRange('30d').start)
        .reduce((sum, inv) => sum + inv.totalCents, 0),
      '90d': paidInvoices
        .filter(inv => inv.paidAt && inv.paidAt >= getDateRange('90d').start)
        .reduce((sum, inv) => sum + inv.totalCents, 0),
      'all': allPaidInvoices.reduce((sum, inv) => sum + inv.totalCents, 0),
    },
    averageTicket: {
      '7d': calculateAverageTicket(paidInvoices.filter(inv => inv.paidAt && inv.paidAt >= getDateRange('7d').start)),
      '30d': calculateAverageTicket(paidInvoices.filter(inv => inv.paidAt && inv.paidAt >= getDateRange('30d').start)),
      '90d': calculateAverageTicket(paidInvoices.filter(inv => inv.paidAt && inv.paidAt >= getDateRange('90d').start)),
      'all': calculateAverageTicket(allPaidInvoices),
    },
    arAging: calculateARAging(outstandingInvoices, organization),
    closeRate: {
      sent: sentEstimates,
      accepted: acceptedEstimates,
      rate: sentEstimates > 0 ? (acceptedEstimates / sentEstimates) * 100 : 0,
    },
    jobsCompleted: {
      '7d': await db.job.count({
        where: { organizationId, status: 'completed', completedAt: { gte: getDateRange('7d').start } },
      }),
      '30d': completedJobs,
      '90d': await db.job.count({
        where: { organizationId, status: 'completed', completedAt: { gte: getDateRange('90d').start } },
      }),
      'all': await db.job.count({
        where: { organizationId, status: 'completed' },
      }),
    },
    outstanding: outstandingInvoices.reduce((sum, inv) => sum + inv.outstandingCents, 0),
  }

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Money Analytics</h1>
        <p className="text-sm text-muted-foreground">{organization.name}</p>
      </div>

      <div className="space-y-6">
        <PeriodSelector period={period} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            title="Revenue"
            value={formatCents(analytics.revenueByPeriod[period])}
            subtitle={`Paid invoices in ${getPeriodLabel(period)}`}
            trend={null}
          />
          <MetricCard
            title="Average Ticket"
            value={formatCents(analytics.averageTicket[period])}
            subtitle={`Per paid invoice in ${getPeriodLabel(period)}`}
            trend={null}
          />
          <MetricCard
            title="Outstanding"
            value={formatCents(analytics.outstanding)}
            subtitle="Total unpaid invoices"
            trend={null}
            variant={analytics.outstanding > 0 ? 'warning' : 'success'}
          />
          <MetricCard
            title="Jobs Completed"
            value={analytics.jobsCompleted[period].toString()}
            subtitle={`Completed jobs in ${getPeriodLabel(period)}`}
            trend={null}
          />
          <MetricCard
            title="Close Rate"
            value={`${analytics.closeRate.rate.toFixed(1)}%`}
            subtitle={`${analytics.closeRate.accepted} of ${analytics.closeRate.sent} estimates accepted`}
            trend={null}
          />
          <MetricCard
            title="Total Revenue"
            value={formatCents(analytics.revenueByPeriod.all)}
            subtitle="All-time paid invoices"
            trend={null}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Accounts Receivable Aging</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <AgingRow
                label="Current"
                amount={analytics.arAging.current}
                days="Not yet due"
                variant="success"
              />
              <AgingRow
                label={`1-${organization.collectionsOverdue1Days} days overdue`}
                amount={analytics.arAging.overdue1}
                days={`${organization.collectionsOverdue1Days} days past due`}
                variant="warning"
              />
              <AgingRow
                label={`${organization.collectionsOverdue1Days + 1}-${organization.collectionsOverdue2Days} days overdue`}
                amount={analytics.arAging.overdue2}
                days={`${organization.collectionsOverdue2Days} days past due`}
                variant="warning"
              />
              <AgingRow
                label={`${organization.collectionsOverdue2Days + 1}+ days overdue`}
                amount={analytics.arAging.overdue3}
                days={`${organization.collectionsOverdue2Days + 1}+ days past due`}
                variant="danger"
              />
              <div className="border-t pt-4 mt-4">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Outstanding</span>
                  <span className="text-xl font-bold">{formatCents(analytics.outstanding)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function MetricCard({
  title,
  value,
  subtitle,
  trend,
  variant = 'default',
}: {
  title: string
  value: string
  subtitle: string
  trend: { value: number; label: string } | null
  variant?: 'default' | 'warning' | 'success'
}) {
  const colorClass = variant === 'warning' ? 'text-amber-600' : variant === 'success' ? 'text-emerald-600' : ''

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        {trend && (
          <p className={`text-xs mt-1 ${trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function AgingRow({
  label,
  amount,
  days,
  variant,
}: {
  label: string
  amount: number
  days: string
  variant: 'success' | 'warning' | 'danger'
}) {
  const colorClass = variant === 'success' ? 'text-emerald-600' : variant === 'warning' ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="flex justify-between items-center py-2">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{days}</p>
      </div>
      <span className={`font-semibold ${colorClass}`}>{formatCents(amount)}</span>
    </div>
  )
}

function PeriodSelector({ period }: { period: PeriodKey }) {
  const periods: { key: PeriodKey; label: string }[] = [
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
    { key: 'all', label: 'All time' },
  ]

  return (
    <div className="flex gap-2">
      {periods.map(p => (
        <a
          key={p.key}
          href={`/analytics?period=${p.key}`}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            period === p.key
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {p.label}
        </a>
      ))}
    </div>
  )
}

function getPeriodLabel(period: PeriodKey): string {
  switch (period) {
    case '7d': return 'last 7 days'
    case '30d': return 'last 30 days'
    case '90d': return 'last 90 days'
    case 'all': return 'all time'
  }
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}