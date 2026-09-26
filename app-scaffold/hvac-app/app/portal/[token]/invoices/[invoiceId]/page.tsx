import { formatDateOnly } from '@/lib/format'
import { validatePortalToken } from '@/lib/portal'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PortalPayButton } from './portal-pay-button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function PortalInvoiceDetailPage({
  params,
}: {
  params: Promise<{ token: string; invoiceId: string }>
}) {
  const { token, invoiceId } = await params

  const ctx = await validatePortalToken(token)
  if (!ctx) {
    notFound()
  }

  // Customer-safe projection — no internal notes, no collections data
  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId: ctx.organizationId,
      customerId: ctx.customerId,
      status: { not: 'draft' },
    },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      descriptionOfWork: true,
      subtotalCents: true,
      taxCents: true,
      totalCents: true,
      outstandingCents: true,
      dueDate: true,
      paidAt: true,
      lineItems: {
        select: { id: true, name: true, description: true, quantity: true, unitPriceCents: true, lineTotalCents: true },
        orderBy: { sortOrder: 'asc' },
      },
      job: { select: { title: true } },
    },
  })

  if (!invoice) {
    notFound()
  }

  await trackEvent({
    organizationId: ctx.organizationId,
    eventName: 'customer_portal_invoice_viewed',
    entityType: 'invoice',
    entityId: invoiceId,
  })

  const canPay = invoice.status !== 'paid' && invoice.status !== 'void'

  return (
    <main className="px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-175">
        <div className="mb-5">
          <Link href={`/portal/${token}` as never} className="text-xs text-muted-foreground hover:underline">
            &larr; Back to portal
          </Link>
        </div>

        <Card className="mb-4">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl font-bold">Invoice #{invoice.invoiceNumber}</CardTitle>
                <CardDescription>From {ctx.organizationName} — {invoice.job.title}</CardDescription>
              </div>
              <Badge
                variant="secondary"
                className={cn(statusClasses(invoice.status))}
              >
                {customerFriendlyStatus(invoice.status)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <p>{formatCents(invoice.subtotalCents)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tax</p>
                <p>{formatCents(invoice.taxCents)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-bold">{formatCents(invoice.totalCents)}</p>
              </div>
            </div>

            {invoice.outstandingCents > 0 && (
              <div className="rounded-lg bg-amber-50 px-4 py-3">
                <span className="font-bold text-amber-800">
                  Amount due: {formatCents(invoice.outstandingCents)}
                </span>
                {invoice.dueDate && (
                  <span className="ml-3 text-xs text-muted-foreground">
                    Due {formatDateOnly(invoice.dueDate)}
                  </span>
                )}
              </div>
            )}

            {invoice.status === 'paid' && invoice.paidAt && (
              <div className="rounded-lg bg-green-50 px-4 py-3">
                <span className="font-bold text-green-800">
                  Paid on {new Date(invoice.paidAt).toLocaleDateString()}
                </span>
              </div>
            )}

            {invoice.descriptionOfWork && (
              <div>
                <p className="text-xs text-muted-foreground">Description of work</p>
                <p className="whitespace-pre-wrap">{invoice.descriptionOfWork}</p>
              </div>
            )}

            {invoice.lineItems.length > 0 && (
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
                  {invoice.lineItems.map((li) => (
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
          </CardContent>
        </Card>

        {canPay && (
          <Card className="text-center">
            <CardHeader>
              <CardTitle>Pay this invoice</CardTitle>
              <CardDescription>
                Secure payment powered by Stripe
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PortalPayButton token={token} invoiceId={invoice.id} />
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <a href={`/api/invoices/${invoice.id}/pdf?token=${token}`} className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}>
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

function customerFriendlyStatus(status: string): string {
  switch (status) {
    case 'sent': return 'Awaiting payment'
    case 'overdue': return 'Overdue'
    case 'paid': return 'Paid'
    case 'void': return 'Cancelled'
    default: return status
  }
}

function statusClasses(status: string): string {
  switch (status) {
    case 'sent': return 'bg-blue-100 text-blue-700'
    case 'overdue': return 'bg-amber-100 text-amber-800'
    case 'paid': return 'bg-green-100 text-green-800'
    case 'void': return 'bg-gray-100 text-gray-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}
