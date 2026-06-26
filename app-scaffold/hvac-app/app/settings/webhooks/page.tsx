import { requireAuth } from '@/lib/session'
import { listDeadLettered } from '@/lib/webhook-store'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { replayWebhookEvent } from './actions'

export default async function WebhookEventsPage() {
  const { role } = await requireAuth()

  if (role !== 'owner') {
    return (
      <main>
        <Card className="mx-auto mt-16 max-w-120 text-center">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Only organization owners can view the webhook event log.</CardDescription>
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

  const events = await listDeadLettered()

  return (
    <main>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold">Dead-lettered webhook events</h1>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">No dead-lettered webhook events.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-b-2">
                  <TableHead className="text-[11px] font-semibold">Time</TableHead>
                  <TableHead className="text-[11px] font-semibold">Event type</TableHead>
                  <TableHead className="text-[11px] font-semibold">Stripe event id</TableHead>
                  <TableHead className="text-[11px] font-semibold">Org</TableHead>
                  <TableHead className="text-[11px] font-semibold">Attempts</TableHead>
                  <TableHead className="text-[11px] font-semibold">Last error</TableHead>
                  <TableHead className="text-[11px] font-semibold"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="align-top">
                      <span className="whitespace-nowrap text-xs">
                        {new Date(ev.updatedAt).toLocaleDateString()}{' '}
                        {new Date(ev.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge className="text-[11px] whitespace-nowrap text-white bg-red-600">
                        {ev.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="text-muted-foreground text-xs font-mono">{ev.stripeEventId.slice(0, 12)}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="text-muted-foreground text-xs">{ev.orgId ?? 'platform'}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="text-muted-foreground text-xs">{ev.attempts}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="text-muted-foreground text-[11px]">
                        {ev.lastError ? ev.lastError.slice(0, 80) : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <form action={replayWebhookEvent}>
                        <input type="hidden" name="webhookEventId" value={ev.id} />
                        <button
                          type="submit"
                          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
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
        <Link href="/settings" className="text-xs text-muted-foreground hover:underline">
          Back to settings
        </Link>
      </div>
    </main>
  )
}
