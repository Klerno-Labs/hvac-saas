import Link from 'next/link'
import { requirePlatformAdmin } from '@/lib/require-platform-admin'
import { db } from '@/lib/db'
import { replayEventAction } from './actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function StripeDeadLetterPage() {
  const admin = await requirePlatformAdmin()
  if (!admin.authorized) {
    return (
      <main>
        <Card className="mx-auto mt-16 max-w-120 text-center">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>{admin.error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard" className={cn(buttonVariants())}>
              Back to dashboard
            </Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  const [deadLettered, retryScheduled, recent] = await Promise.all([
    db.stripeWebhookEvent.findMany({
      where: { status: 'dead_lettered' },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    db.stripeWebhookEvent.count({ where: { status: 'retry_scheduled' } }),
    db.stripeWebhookEvent.count({
      where: { status: 'succeeded', updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ])

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Stripe webhook dead-letter queue</h1>
        <p className="text-sm text-muted-foreground">
          Platform-operator view across all tenants. Replaying an event re-fetches it from Stripe and
          re-dispatches it on the next scheduler tick.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Dead-lettered" value={deadLettered.length} tone="bg-red-600" />
        <StatCard label="Awaiting retry" value={retryScheduled} tone="bg-amber-600" />
        <StatCard label="Succeeded (24h)" value={recent} tone="bg-emerald-600" />
      </div>

      {deadLettered.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">No dead-lettered events. Everything is processing or scheduled for retry.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-b-2">
                  <TableHead className="text-[11px] font-semibold">Event</TableHead>
                  <TableHead className="text-[11px] font-semibold">Type</TableHead>
                  <TableHead className="text-[11px] font-semibold">Attempts</TableHead>
                  <TableHead className="text-[11px] font-semibold">Last error</TableHead>
                  <TableHead className="text-[11px] font-semibold">Updated</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deadLettered.map((row) => (
                  <TableRow key={row.eventId}>
                    <TableCell className="align-top">
                      <span className="text-[11px] font-mono text-muted-foreground">{row.eventId}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge className="text-[11px] whitespace-nowrap text-white bg-gray-700">{row.eventType}</Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="text-xs">{row.attempts}</span>
                    </TableCell>
                    <TableCell className="align-top max-w-[320px]">
                      <span className="text-[11px] text-muted-foreground break-words">
                        {row.lastError ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(row.updatedAt).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <form action={replayEventAction.bind(null, row.eventId)}>
                        <button
                          type="submit"
                          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
                        >
                          Replay
                        </button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="mt-4">
        <Link href="/dashboard" className="text-xs text-muted-foreground hover:underline">
          Back to dashboard
        </Link>
      </div>
    </main>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={cn('inline-block w-2 h-2 rounded-full', tone)} />
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}
