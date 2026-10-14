import { jobAccessWhere } from '@/lib/mutation-access'
import { photoReadUrl } from '@/lib/photo-url'
import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProofOfWorkForm } from './form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ProofOfWorkPage({ params }: { params: Promise<{ jobId: string }> }) {
  const context = await requireActiveSubscription()
  const { organizationId } = context
  const { jobId } = await params

  const job = await db.job.findFirst({
    where: { id: jobId, ...jobAccessWhere(context) },
    include: { customer: true, assets: { orderBy: { createdAt: 'asc' } } },
  })

  if (!job) {
    notFound()
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <Link href={`/jobs/${job.id}` as never} className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        &larr; Back to job
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Record proof of work</CardTitle>
          <CardDescription>
            Job: <strong>{job.title}</strong> — {job.customer.firstName} {job.customer.lastName || ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {job.workSummary && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs font-semibold text-green-700">Proof of work already recorded</p>
              <p className="text-xs mt-1">You can update the details below.</p>
            </div>
          )}

          <ProofOfWorkForm
            jobId={job.id}
            initialData={{
              workSummary: job.workSummary || '',
              materialsUsed: job.materialsUsed || '',
              completionNotes: job.completionNotes || '',
              technicianName: job.technicianName || '',
            }}
            existingAssets={job.assets.map((a) => ({
              id: a.id,
              fileUrl: photoReadUrl(a),
              fileType: a.fileType,
            }))}
          />
        </CardContent>
      </Card>
    </main>
  )
}
