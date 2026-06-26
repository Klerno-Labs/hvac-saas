import { validatePortalToken } from '@/lib/portal'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ApprovalSection } from './approval-section'
import { formatDepositLabel } from '@/lib/deposit'

export default async function PortalEstimateDetailPage({
  params,
}: {
  params: Promise<{ token: string; estimateId: string }>
}) {
  const { token, estimateId } = await params

  const ctx = await validatePortalToken(token)
  if (!ctx) {
    notFound()
  }

  // Customer-safe projection — no internal notes, no AI draft flag
  const estimate = await db.estimate.findFirst({
    where: {
      id: estimateId,
      organizationId: ctx.organizationId,
      job: { customerId: ctx.customerId },
      status: { in: ['sent', 'accepted', 'declined'] },
    },
    select: {
      id: true,
      estimateNumber: true,
      status: true,
      scopeOfWork: true,
      terms: true,
      subtotalCents: true,
      taxCents: true,
      totalCents: true,
      sentAt: true,
      acceptedAt: true,
      declinedAt: true,
      decisionByName: true,
      depositRequired: true,
      depositAmountCents: true,
      depositStatus: true,
      depositPaidAt: true,
      lineItems: {
        select: { id: true, name: true, description: true, quantity: true, unitPriceCents: true, lineTotalCents: true },
        orderBy: { sortOrder: 'asc' },
      },
      job: { select: { title: true } },
    },
  })

  if (!estimate) {
    notFound()
  }

  // Stamp viewedAt the first time customer opens it (don't overwrite later views)
  await db.estimate.updateMany({
    where: { id: estimateId, viewedAt: null },
    data: { viewedAt: new Date() },
  })

  await trackEvent({
    organizationId: ctx.organizationId,
    eventName: 'customer_portal_estimate_viewed',
    entityType: 'estimate',
    entityId: estimateId,
  })

  return (
    <main>
      <div className="mx-auto max-w-175">
        <div className="mb-5">
          <Link href={`/portal/${token}` as never} className="text-xs text-muted-foreground hover:underline">
            &larr; Back to portal
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl font-bold">Estimate #{estimate.estimateNumber}</CardTitle>
                <CardDescription>From {ctx.organizationName} — {estimate.job.title}</CardDescription>
              </div>
              <Badge
                variant="secondary"
                className={cn(estimateStatusClasses(estimate.status))}
              >
                {estimate.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <p>{formatCents(estimate.subtotalCents)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tax</p>
                <p>{formatCents(estimate.taxCents)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-bold">{formatCents(estimate.totalCents)}</p>
              </div>
            </div>

            {estimate.depositRequired && estimate.depositAmountCents > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Deposit</p>
                <p className={estimate.depositStatus === 'paid' ? 'text-emerald-700' : undefined}>
                  {estimate.depositStatus === 'paid'
                    ? 'Deposit paid ✓'
                    : formatDepositLabel(estimate.depositAmountCents, estimate.depositStatus)}
                </p>
              </div>
            )}

            {estimate.scopeOfWork && (
              <div>
                <p className="text-xs text-muted-foreground">Scope of work</p>
                <p className="whitespace-pre-wrap">{estimate.scopeOfWork}</p>
              </div>
            )}

            {estimate.lineItems.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Item</TableHead>
                    <TableHead className="text-right text-xs font-semibold text-muted-foreground">Qty</TableHead>
                    <TableHead className="text-right text-xs font-semibold text-muted-foreground">Price</TableHead>
                    <TableHead className="text-right text-xs font-semibold text-muted-foreground">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estimate.lineItems.map((li) => (
                    <TableRow key={li.id}>
                      <TableCell>
                        <strong>{li.name}</strong>
                        {li.description && <br />}
                        {li.description && <span className="text-xs text-muted-foreground">{li.description}</span>}
                      </TableCell>
                      <TableCell className="text-right">{li.quantity}</TableCell>
                      <TableCell className="text-right">{formatCents(li.unitPriceCents)}</TableCell>
                      <TableCell className="text-right">{formatCents(li.lineTotalCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {estimate.terms && (
              <div>
                <p className="text-xs text-muted-foreground">Terms</p>
                <p>{estimate.terms}</p>
              </div>
            )}

            {estimate.sentAt && (
              <div>
                <p className="text-xs text-muted-foreground">
                  Sent on {new Date(estimate.sentAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-4">
          <ApprovalSection
            token={token}
            estimateId={estimate.id}
            status={estimate.status}
            decisionByName={estimate.decisionByName}
            acceptedAt={estimate.acceptedAt}
            declinedAt={estimate.declinedAt}
            depositRequired={estimate.depositRequired}
            depositAmountCents={estimate.depositAmountCents}
            depositStatus={estimate.depositStatus}
          />
        </div>

        <div className="text-center mt-4">
          <a href={`/api/estimates/${estimate.id}/pdf?token=${token}`} className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}>
            Download PDF
          </a>
        </div>
      </div>
    </main>
  )
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

function estimateStatusClasses(status: string): string {
  switch (status) {
    case 'accepted': return 'bg-green-100 text-green-800'
    case 'declined': return 'bg-red-50 text-red-800'
    default: return 'bg-blue-100 text-blue-700'
  }
}
