import { formatDateOnly } from '@/lib/format'
import { requirePageCapability } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ToggleActiveButton } from './toggle-button'

function frequencyLabel(frequency: string): string {
  switch (frequency) {
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly'
    case 'biannual': return 'Biannual'
    case 'annual': return 'Annual'
    default: return frequency
  }
}

export default async function RecurringJobDetailPage({
  params,
}: {
  params: Promise<{ recurringId: string }>
}) {
  const { recurringId } = await params
  const { organizationId } = await requirePageCapability('manageJobs')

  const recurringJob = await db.recurringJob.findFirst({
    where: { id: recurringId, organizationId },
    include: {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
          phone: true,
        },
      },
    },
  })

  if (!recurringJob) {
    notFound()
  }

  const recentJobs = await db.job.findMany({
    where: {
      organizationId,
      customerId: recurringJob.customerId,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      title: true,
      status: true,
      scheduledFor: true,
      createdAt: true,
    },
  })

  const isDue = recurringJob.isActive && new Date(recurringJob.nextDueDate) <= new Date()

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
        <Link href="/recurring" className="hover:text-foreground">Recurring Jobs</Link>
        <span>/</span>
        <span className="text-foreground">{recurringJob.title}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold tracking-tight">{recurringJob.title}</h1>
            <Badge variant={recurringJob.isActive ? 'default' : 'secondary'}>
              {recurringJob.isActive ? 'Active' : 'Paused'}
            </Badge>
            <Badge variant="outline">{frequencyLabel(recurringJob.frequency)}</Badge>
            {isDue && <Badge variant="destructive">Due</Badge>}
          </div>
          {recurringJob.description && (
            <p className="text-sm text-muted-foreground">{recurringJob.description}</p>
          )}
        </div>

        <div className="flex gap-2">
          <ToggleActiveButton
            recurringId={recurringJob.id}
            isActive={recurringJob.isActive}
          />
          <Link
            href={`/recurring/${recurringJob.id}/edit` as never}
            className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}
          >
            Edit
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frequency</span>
              <span className="font-medium">{frequencyLabel(recurringJob.frequency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Next due date</span>
              <span className="font-medium">{formatDateOnly(recurringJob.nextDueDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last generated</span>
              <span className="font-medium">
                {recurringJob.lastGeneratedAt
                  ? new Date(recurringJob.lastGeneratedAt).toLocaleDateString()
                  : 'Never'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium">{new Date(recurringJob.createdAt).toLocaleDateString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Customer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <Link
                href={`/customers/${recurringJob.customer.id}` as never}
                className="text-primary hover:underline font-medium"
              >
                {recurringJob.customer.firstName} {recurringJob.customer.lastName || ''}
              </Link>
            </div>
            {recurringJob.customer.companyName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Company</span>
                <span className="font-medium">{recurringJob.customer.companyName}</span>
              </div>
            )}
            {recurringJob.customer.email && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{recurringJob.customer.email}</span>
              </div>
            )}
            {recurringJob.customer.phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium">{recurringJob.customer.phone}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent jobs for this customer */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Recent jobs for this customer</CardTitle>
        </CardHeader>
        <CardContent>
          {recentJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs found for this customer yet.</p>
          ) : (
            <div className="space-y-2">
              {recentJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}` as never}
                  className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors no-underline text-inherit"
                >
                  <div>
                    <span className="text-sm font-medium">{job.title}</span>
                    <span className="text-xs text-muted-foreground ml-3">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {job.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
