import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { InvoiceStatusForm } from './status-form'
import { InvoiceEditForm } from './edit-form'
import { PayButton } from './pay-button'
import { CollectionsSection } from './collections-section'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { organizationId, organization } = await requireActiveSubscription()
  const { invoiceId } = await params

  const [invoice, org] = await Promise.all([
    db.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        job: true,
        customer: true,
        lineItems: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
        collectionAttempts: { orderBy: { createdAt: 'asc' } },
      },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { defaultTaxRateBps: true },
    }),
  ])

  if (!invoice) {
    notFound()
  }

  const isDraft = invoice.status === 'draft'
  const canPay = invoice.status !== 'paid' && invoice.status !== 'void' && invoice.status !== 'draft'
  const stripeReady = organization.stripeChargesEnabled
  const showCollections = invoice.status !== 'draft' && invoice.status !== 'paid' && invoice.status !== 'void'

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <Link href="/invoices" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        &larr; All invoices
      </Link>

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-2xl">Invoice #{invoice.invoiceNumber}</CardTitle>
            <CardDescription>
              Job:{' '}
              <Link href={`/jobs/${invoice.jobId}` as never} className="text-primary hover:underline">
                {invoice.job.title}
              </Link>
              {' '}— {invoice.customer.firstName} {invoice.customer.lastName || ''}
            </CardDescription>
          </div>
          <Badge variant={invoiceVariant(invoice.status)}>{invoice.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Subtotal</p>
              <p className="text-sm font-medium">{formatCents(invoice.subtotalCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tax</p>
              <p className="text-sm font-medium">{formatCents(invoice.taxCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-sm font-bold">{formatCents(invoice.totalCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className={`text-sm font-bold ${invoice.outstandingCents > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {formatCents(invoice.outstandingCents)}
              </p>
            </div>
          </div>

          {invoice.dueDate && (
            <div>
              <p className="text-xs text-muted-foreground">Due date</p>
              <p className="text-sm">{new Date(invoice.dueDate).toLocaleDateString()}</p>
            </div>
          )}

          {invoice.descriptionOfWork && (
            <div>
              <p className="text-xs text-muted-foreground">Description of work</p>
              <p className="text-sm whitespace-pre-wrap">{invoice.descriptionOfWork}</p>
            </div>
          )}

          {invoice.lineItems.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Line items</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-1 text-xs font-semibold text-muted-foreground">Item</th>
                    <th className="text-right py-2 px-1 text-xs font-semibold text-muted-foreground">Qty</th>
                    <th className="text-right py-2 px-1 text-xs font-semibold text-muted-foreground">Unit price</th>
                    <th className="text-right py-2 px-1 text-xs font-semibold text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((li) => (
                    <tr key={li.id} className="border-b">
                      <td className="py-2 px-1">
                        <span className="font-medium">{li.name}</span>
                        {li.description && <><br /><span className="text-xs text-muted-foreground">{li.description}</span></>}
                      </td>
                      <td className="text-right py-2 px-1">{li.quantity}</td>
                      <td className="text-right py-2 px-1">{formatCents(li.unitPriceCents)}</td>
                      <td className="text-right py-2 px-1">{formatCents(li.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {invoice.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm">{invoice.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {canPay && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-lg">Payment</CardTitle></CardHeader>
          <CardContent>
            {stripeReady ? (
              <PayButton invoiceId={invoice.id} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Stripe is not connected. <Link href="/settings" className="text-primary hover:underline">Connect Stripe</Link> to collect payments.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {invoice.payments.length > 0 && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-lg">Payment history</CardTitle></CardHeader>
          <CardContent>
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex justify-between py-2 border-b">
                <div>
                  <span className="text-sm font-semibold">{formatCents(p.amountCents)}</span>
                  <Badge variant={p.status === 'succeeded' ? 'default' : p.status === 'failed' ? 'destructive' : 'secondary'} className="ml-2">
                    {p.status}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : new Date(p.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {showCollections && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-lg">Collections</CardTitle></CardHeader>
          <CardContent>
            <CollectionsSection invoiceId={invoice.id} collectionsPaused={invoice.collectionsPaused} attempts={invoice.collectionAttempts} />
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Update status</CardTitle>
          <a href={`/api/invoices/${invoice.id}/pdf`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}>
            Download PDF
          </a>
        </CardHeader>
        <CardContent>
          <InvoiceStatusForm invoiceId={invoice.id} currentStatus={invoice.status} />
        </CardContent>
      </Card>

      {isDraft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Edit invoice</CardTitle>
            <CardDescription>Only draft invoices can be edited.</CardDescription>
          </CardHeader>
          <CardContent>
            <InvoiceEditForm
              invoiceId={invoice.id}
              initialData={{
                descriptionOfWork: invoice.descriptionOfWork || '',
                notes: invoice.notes || '',
                defaultTaxRateBps: org?.defaultTaxRateBps ?? 0,
                customerTaxExempt: invoice.customer.taxExempt,
                dueDate: invoice.dueDate ? invoice.dueDate.toISOString().split('T')[0] : '',
                lineItems: invoice.lineItems.map((li) => ({
                  name: li.name,
                  description: li.description || '',
                  quantity: li.quantity,
                  unitPriceCents: li.unitPriceCents,
                  taxable: li.taxable,
                  taxRateBps: li.taxRateBps,
                })),
              }}
            />
          </CardContent>
        </Card>
      )}
    </main>
  )
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

function invoiceVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'paid': return 'default'
    case 'void': return 'destructive'
    case 'overdue': return 'destructive'
    case 'sent': return 'outline'
    default: return 'secondary'
  }
}
