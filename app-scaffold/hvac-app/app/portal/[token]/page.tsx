import { validatePortalToken } from '@/lib/portal'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { limit, RL, extractIp } from '@/lib/rate-limit'
import { headers } from 'next/headers'

export default async function PortalDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const guard = await limit({ preset: RL.portalToken, ip: extractIp(await headers()), id: token })
  if (!guard.allowed) {
    notFound()
  }

  const ctx = await validatePortalToken(token)
  if (!ctx) {
    notFound()
  }

  await trackEvent({
    organizationId: ctx.organizationId,
    eventName: 'customer_portal_accessed',
    entityType: 'customer',
    entityId: ctx.customerId,
  })

  const [estimates, invoices] = await Promise.all([
    db.estimate.findMany({
      where: {
        organizationId: ctx.organizationId,
        job: { customerId: ctx.customerId },
        status: { in: ['sent', 'accepted', 'declined'] },
      },
      include: { job: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    db.invoice.findMany({
      where: {
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
        status: { notIn: ['draft'] },
      },
      include: { job: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  const outstandingInvoices = invoices.filter((i) => i.status !== 'paid' && i.status !== 'void')

  return (
    <main>
      <div className="mx-auto max-w-175">
        <Card className="mb-6 text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Welcome, {ctx.customerName}</CardTitle>
            <CardDescription>{ctx.organizationName}</CardDescription>
          </CardHeader>
        </Card>

        {outstandingInvoices.length > 0 && (
          <Card className="mb-4 border-l-4 border-l-amber-600">
            <CardHeader>
              <CardTitle>Payment needed</CardTitle>
            </CardHeader>
            <CardContent>
              {outstandingInvoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/portal/${token}/invoices/${inv.id}` as never}
                  className="no-underline text-inherit"
                >
                  <div className="flex justify-between py-2 border-b border-border cursor-pointer">
                    <div>
                      <strong>#{inv.invoiceNumber}</strong>
                      <span className="ml-2 text-xs text-muted-foreground">{inv.job.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-amber-600">{formatCents(inv.outstandingCents)}</span>
                      {inv.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          Due {new Date(inv.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-muted-foreground">No invoices yet.</p>
            ) : (
              invoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/portal/${token}/invoices/${inv.id}` as never}
                  className="no-underline text-inherit"
                >
                  <div className="flex justify-between py-2 border-b border-border cursor-pointer">
                    <div>
                      <strong>#{inv.invoiceNumber}</strong>
                      <span className="ml-2 text-xs text-muted-foreground">{inv.job.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatCents(inv.totalCents)}</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[11px]',
                          invoiceStatusClasses(inv.status),
                        )}
                      >
                        {customerFriendlyStatus(inv.status)}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {estimates.length > 0 && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Estimates</CardTitle>
            </CardHeader>
            <CardContent>
              {estimates.map((est) => (
                <Link
                  key={est.id}
                  href={`/portal/${token}/estimates/${est.id}` as never}
                  className="no-underline text-inherit"
                >
                  <div className="flex justify-between py-2 border-b border-border cursor-pointer">
                    <div>
                      <strong>#{est.estimateNumber}</strong>
                      <span className="ml-2 text-xs text-muted-foreground">{est.job.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatCents(est.totalCents)}</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[11px]',
                          estimateStatusClasses(est.status),
                        )}
                      >
                        {est.status}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

function customerFriendlyStatus(status: string): string {
  switch (status) {
    case 'sent': return 'Awaiting payment'
    case 'overdue': return 'Overdue'
    case 'paid': return 'Paid'
    case 'void': return 'Cancelled'
    default: return status
  }
}

function invoiceStatusClasses(status: string): string {
  switch (status) {
    case 'sent': return 'bg-blue-100 text-blue-700'
    case 'overdue': return 'bg-amber-100 text-amber-800'
    case 'paid': return 'bg-green-100 text-green-800'
    case 'void': return 'bg-gray-100 text-gray-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}

function estimateStatusClasses(status: string): string {
  switch (status) {
    case 'accepted': return 'bg-green-100 text-green-800'
    case 'declined': return 'bg-red-50 text-red-800'
    default: return 'bg-blue-100 text-blue-700'
  }
}
