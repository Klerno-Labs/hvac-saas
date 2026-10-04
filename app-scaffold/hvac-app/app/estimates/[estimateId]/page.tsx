import { requireActiveSubscription } from '@/lib/session'
import { jobAccessWhere } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EstimateStatusForm } from './status-form'
import { ConvertEstimateButton } from './convert-button'
import { canDo } from '@/lib/permissions'
import { EstimateEditForm } from './edit-form'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getEstimateCatalog } from '@/lib/estimate-catalog'

export default async function EstimateDetailPage({ params }: { params: Promise<{ estimateId: string }> }) {
  const context = await requireActiveSubscription()
  const { organizationId, role } = context
  const { estimateId } = await params

  const estimate = await db.estimate.findFirst({
    where: { id: estimateId, organizationId, job: jobAccessWhere(context), ...(!canDo(role, 'editPricing') ? { status: { not: 'draft' } } : {}) },
    include: {
      job: { include: { customer: true } },
      lineItems: { orderBy: { sortOrder: 'asc' } },
      invoice: { select: { id: true, invoiceNumber: true, status: true } },
    },
  })

  if (!estimate) {
    notFound()
  }

  const canEditPricing = canDo(role, 'editPricing')
  const isDraft = estimate.status === 'draft' && canEditPricing

  const priceBookItems = isDraft ? await getEstimateCatalog(context) : []

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="mb-5">
        <Link href="/estimates" className="text-xs text-muted-foreground hover:underline">
          &larr; All estimates
        </Link>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-semibold">Estimate #{estimate.estimateNumber}</h1>
              <CardDescription>
                Job:{' '}
                <Link href={`/jobs/${estimate.jobId}` as never} className="text-primary hover:underline">
                  {estimate.job.title}
                </Link>
                {' '}— {estimate.job.customer.firstName} {estimate.job.customer.lastName || ''}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {estimate.aiDraftUsed && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                  AI draft
                </Badge>
              )}
              <Badge className={estimateStatusClass(estimate.status)}>
                {estimate.status}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-4">
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

          {estimate.scopeOfWork && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">Scope of work</p>
              <p className="whitespace-pre-wrap">{estimate.scopeOfWork}</p>
            </div>
          )}

          {estimate.lineItems.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">Line items</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 px-1 text-xs font-semibold text-muted-foreground text-left">Item</th>
                    <th className="py-2 px-1 text-xs font-semibold text-muted-foreground text-right">Qty</th>
                    <th className="py-2 px-1 text-xs font-semibold text-muted-foreground text-right">Unit price</th>
                    <th className="py-2 px-1 text-xs font-semibold text-muted-foreground text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.lineItems.map((li) => (
                    <tr key={li.id} className="border-b">
                      <td className="py-2 px-1">
                        <strong>{li.name}</strong>
                        {li.description && <br />}
                        {li.description && <span className="text-xs text-muted-foreground">{li.description}</span>}
                      </td>
                      <td className="py-2 px-1 text-right">{li.quantity}</td>
                      <td className="py-2 px-1 text-right">{formatCents(li.unitPriceCents)}</td>
                      <td className="py-2 px-1 text-right">{formatCents(li.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {estimate.terms && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">Terms</p>
              <p>{estimate.terms}</p>
            </div>
          )}

          {estimate.notes && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">Internal notes</p>
              <p>{estimate.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {(estimate.invoice || (estimate.status === 'accepted' && canEditPricing)) && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{estimate.invoice ? 'Invoice created' : 'Ready to invoice'}</CardTitle>
            <CardDescription>
              {estimate.invoice
                ? `Invoice ${estimate.invoice.invoiceNumber} is ${estimate.invoice.status}. The accepted estimate is preserved for your records.`
                : 'Copy the approved scope, line items, and tax into an editable draft. Review it before sending anything to the customer.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {estimate.invoice ? (
              <Link href={`/invoices/${estimate.invoice.id}` as never} className={cn(buttonVariants(), 'no-underline')}>
                Open invoice {estimate.invoice.invoiceNumber}
              </Link>
            ) : <ConvertEstimateButton estimateId={estimate.id} />}
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Update status</CardTitle>
          <a href={`/api/estimates/${estimate.id}/pdf`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}>
            Download PDF
          </a>
        </CardHeader>
        <CardContent>
          {canEditPricing ? <EstimateStatusForm estimateId={estimate.id} currentStatus={estimate.status} /> : (
            <p className="text-sm text-muted-foreground">An owner or office administrator can update this estimate.</p>
          )}
        </CardContent>
      </Card>

      {isDraft && (
        <Card>
          <CardHeader>
            <CardTitle>Edit estimate</CardTitle>
            <CardDescription>
              Only draft estimates can be edited.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EstimateEditForm
              estimateId={estimate.id}
              priceBookItems={priceBookItems}
              initialData={{
                scopeOfWork: estimate.scopeOfWork || '',
                terms: estimate.terms || '',
                notes: estimate.notes || '',
                taxCents: estimate.taxCents,
                lineItems: estimate.lineItems.map((li) => ({
                  name: li.name,
                  description: li.description || '',
                  quantity: li.quantity,
                  unitPriceCents: li.unitPriceCents,
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

function estimateStatusClass(status: string): string {
  switch (status) {
    case 'draft': return 'bg-gray-500 text-white'
    case 'sent': return 'bg-blue-600 text-white'
    case 'accepted': return 'bg-emerald-600 text-white'
    case 'declined': return 'bg-red-600 text-white'
    default: return 'bg-gray-500 text-white'
  }
}
