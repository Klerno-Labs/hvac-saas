import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { JobStatusForm } from './status-form'
import { PartsUsedSection } from './parts-used'
import { ReviewSection } from './review-section'
import { TerminalCollectSection } from './terminal-collect-section'
import { getTerminalEligibility } from '@/lib/terminal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { organizationId, organization } = await requireActiveSubscription()
  const { jobId } = await params

  const [job, inventoryItems, existingReview] = await Promise.all([
    db.job.findFirst({
      where: { id: jobId, organizationId },
      include: {
        customer: true,
        estimates: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } },
        assets: { orderBy: { createdAt: 'asc' } },
        signatures: { orderBy: { signedAt: 'desc' } },
        inventoryUsages: {
          orderBy: { createdAt: 'desc' },
          include: { inventoryItem: true },
        },
      },
    }),
    db.inventoryItem.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, sku: true, quantityOnHand: true },
    }),
    db.customerReview.findUnique({
      where: { jobId },
      select: { rating: true, comment: true, submittedAt: true, token: true },
    }),
  ])

  if (!job) {
    notFound()
  }

  const terminalEligibility = getTerminalEligibility(organization)

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <Link href="/jobs" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        &larr; All jobs
      </Link>

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-2xl">{job.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Customer:{' '}
              <Link href={`/customers/${job.customerId}` as never} className="text-primary hover:underline">
                {job.customer.firstName} {job.customer.lastName || ''}
              </Link>
            </p>
          </div>
          <Badge variant={statusVariant(job.status)}>{job.status.replace('_', ' ')}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Scheduled</p>
              <p className="text-sm font-medium">{job.scheduledFor ? new Date(job.scheduledFor).toLocaleDateString() : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-sm font-medium">{job.completedAt ? new Date(job.completedAt).toLocaleDateString() : '—'}</p>
            </div>
          </div>

          {job.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm">{job.notes}</p>
            </div>
          )}

          {job.technicianName && (
            <div>
              <p className="text-xs text-muted-foreground">Technician</p>
              <p className="text-sm">{job.technicianName}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Proof of work section */}
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold">Proof of work</h2>
        <Link href={`/jobs/${job.id}/proof-of-work` as never} className={cn(buttonVariants({ size: 'sm' }), 'no-underline')}>
          {job.workSummary ? 'Update' : 'Record completion'}
        </Link>
      </div>

      {job.workSummary ? (
        <Card className="mb-4">
          <CardContent className="space-y-3 pt-4">
            <div>
              <p className="text-xs text-muted-foreground">Work summary</p>
              <p className="text-sm whitespace-pre-wrap">{job.workSummary}</p>
            </div>
            {job.materialsUsed && (
              <div>
                <p className="text-xs text-muted-foreground">Materials used</p>
                <p className="text-sm">{job.materialsUsed}</p>
              </div>
            )}
            {job.completionNotes && (
              <div>
                <p className="text-xs text-muted-foreground">Completion notes</p>
                <p className="text-sm">{job.completionNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-4">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No proof of work recorded yet.</p>
          </CardContent>
        </Card>
      )}

      {/* Proof-of-work photos */}
      {job.assets.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-2">Photos ({job.assets.length})</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {job.assets.map((asset) => (
                <a
                  key={asset.id}
                  href={asset.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-square rounded-lg overflow-hidden border bg-muted block"
                >
                  <img
                    src={asset.fileUrl}
                    alt="Proof of work"
                    className="object-cover w-full h-full hover:opacity-90 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signatures */}
      {job.signatures.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-2">
              Customer signature{job.signatures.length > 1 ? 's' : ''} ({job.signatures.length})
            </p>
            <div className="space-y-3">
              {job.signatures.map((signature) => (
                <div key={signature.id} className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-medium">{signature.signerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(signature.signedAt).toLocaleString()}
                    </p>
                  </div>
                  <img
                    src={signature.signatureImageUrl}
                    alt={`Signature by ${signature.signerName}`}
                    className="max-h-20 bg-white rounded border p-1"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parts used section */}
      <PartsUsedSection
        jobId={job.id}
        usages={job.inventoryUsages}
        inventoryItems={inventoryItems}
      />

      {/* Estimates section */}
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold">Estimates</h2>
        <Link href={`/estimates/new?jobId=${job.id}` as never} className={cn(buttonVariants({ size: 'sm' }), 'no-underline')}>
          New estimate
        </Link>
      </div>

      {job.estimates.length === 0 ? (
        <Card className="mb-4">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No estimates yet for this job.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 mb-4">
          {job.estimates.map((est) => (
            <Link key={est.id} href={`/estimates/${est.id}` as never} className="no-underline text-inherit">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <strong>#{est.estimateNumber}</strong>
                      {est.aiDraftUsed && <span className="text-xs text-muted-foreground ml-2">AI draft</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">${(est.totalCents / 100).toFixed(2)}</span>
                      <Badge variant={estimateStatusVariant(est.status)}>{est.status}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Invoices section */}
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold">Invoices</h2>
        <Link href={`/invoices/new?jobId=${job.id}` as never} className={cn(buttonVariants({ size: 'sm' }), 'no-underline')}>
          New invoice
        </Link>
      </div>

      {job.invoices.length === 0 ? (
        <Card className="mb-4">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No invoices yet for this job.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 mb-4">
          {job.invoices.map((inv) => (
            <Link key={inv.id} href={`/invoices/${inv.id}` as never} className="no-underline text-inherit">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-3">
                  <div className="flex justify-between items-center">
                    <strong>#{inv.invoiceNumber}</strong>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">${(inv.totalCents / 100).toFixed(2)}</span>
                      <Badge variant={invoiceStatusVariant(inv.status)}>{inv.status}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* In-field card payment (Stripe Terminal) */}
      <TerminalCollectSection
        eligible={terminalEligibility.eligible}
        ineligibleReason={terminalEligibility.reason}
        invoices={job.invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          totalCents: inv.totalCents,
          outstandingCents: inv.outstandingCents,
          status: inv.status,
        }))}
      />

      {/* Customer review section */}
      <ReviewSection
        jobId={job.id}
        jobStatus={job.status}
        existingReview={
          existingReview
            ? {
                rating: existingReview.rating,
                comment: existingReview.comment,
                submittedAt: existingReview.submittedAt?.toISOString() ?? null,
                token: existingReview.token,
              }
            : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Update status</CardTitle>
        </CardHeader>
        <CardContent>
          <JobStatusForm jobId={job.id} currentStatus={job.status} />
        </CardContent>
      </Card>
    </main>
  )
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed': return 'default'
    case 'cancelled': return 'destructive'
    case 'in_progress': return 'outline'
    default: return 'secondary'
  }
}

function estimateStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'accepted': return 'default'
    case 'declined': return 'destructive'
    case 'sent': return 'outline'
    default: return 'secondary'
  }
}

function invoiceStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'paid': return 'default'
    case 'void': return 'destructive'
    case 'overdue': return 'destructive'
    case 'sent': return 'outline'
    default: return 'secondary'
  }
}
