import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound, redirect } from 'next/navigation'
import { EstimateForm } from './form'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export default async function NewEstimatePage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const { organizationId } = await requireActiveSubscription()
  const { jobId } = await searchParams

  if (!jobId) {
    redirect('/jobs')
  }

  const [job, org] = await Promise.all([
    db.job.findFirst({
      where: { id: jobId, organizationId },
      include: { customer: { select: { firstName: true, lastName: true, taxExempt: true } } },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { defaultTaxRateBps: true },
    }),
  ])

  if (!job) {
    notFound()
  }

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <Card className="max-w-175 mx-auto">
        <CardHeader>
          <CardTitle className="text-xl">New estimate</CardTitle>
          <CardDescription>
            For job: <strong>{job.title}</strong> — {job.customer.firstName} {job.customer.lastName || ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EstimateForm
            jobId={job.id}
            jobTitle={job.title}
            defaultTaxRateBps={org?.defaultTaxRateBps ?? 0}
            customerTaxExempt={job.customer.taxExempt}
          />
        </CardContent>
      </Card>
    </main>
  )
}
