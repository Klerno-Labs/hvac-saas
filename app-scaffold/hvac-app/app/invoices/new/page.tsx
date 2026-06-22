import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound, redirect } from 'next/navigation'
import { InvoiceForm } from './form'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const { organizationId, organization } = await requireActiveSubscription()
  const { jobId } = await searchParams

  if (!jobId) {
    redirect('/jobs')
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    include: {
      customer: true,
      estimates: {
        where: { status: 'accepted' },
        include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!job) {
    notFound()
  }

  // Seed from accepted estimate if available
  const acceptedEstimate = job.estimates[0] || null
  const seedDescription = job.workSummary
    || acceptedEstimate?.scopeOfWork
    || `Work performed for ${job.title}`
  const seedLineItems = acceptedEstimate?.lineItems.map((li) => ({
    name: li.name,
    description: li.description || '',
    quantity: li.quantity,
    unitPriceCents: li.unitPriceCents,
    taxable: li.taxable,
    taxRateBps: li.taxRateBps,
  })) || [{ name: job.title, description: 'Service as described', quantity: 1, unitPriceCents: 0, taxable: true, taxRateBps: null }]

  return (
    <main>
      <Card className="mx-auto max-w-175">
        <CardHeader>
          <CardTitle>New invoice</CardTitle>
          <CardDescription>
            For job: <strong>{job.title}</strong> — {job.customer.firstName} {job.customer.lastName || ''}
          </CardDescription>
          {acceptedEstimate && (
            <p className="mt-1 text-xs text-emerald-600">
              Seeded from accepted estimate #{acceptedEstimate.estimateNumber}
            </p>
          )}
          {job.workSummary && !acceptedEstimate && (
            <p className="mt-1 text-xs text-blue-600">
              Seeded from proof of work summary
            </p>
          )}
        </CardHeader>
        <CardContent>
          <InvoiceForm
            jobId={job.id}
            defaultTaxRateBps={organization.defaultTaxRateBps}
            customerTaxExempt={job.customer.taxExempt}
            initialData={{
              descriptionOfWork: seedDescription,
              notes: '',
              dueDate: '',
              lineItems: seedLineItems,
            }}
          />
        </CardContent>
      </Card>
    </main>
  )
}
