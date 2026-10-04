import { formatDateOnly } from '@/lib/format'
import { requirePageCapability } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function RecurringJobsPage() {
  const { organizationId } = await requirePageCapability('manageJobs')

  const recurringJobs = await db.recurringJob.findMany({
    where: { organizationId },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ isActive: 'desc' }, { nextDueDate: 'asc' }],
  })

  const activeJobs = recurringJobs.filter((r) => r.isActive)
  const inactiveJobs = recurringJobs.filter((r) => !r.isActive)

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Recurring Jobs</h1>
        <Link href="/recurring/new" className={cn(buttonVariants(), 'no-underline')}>New recurring job</Link>
      </div>

      {recurringJobs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No recurring jobs yet. Create one for maintenance contracts or scheduled services.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeJobs.length > 0 && (
            <div className="mb-8">
              <h2 className="text-base font-semibold mb-3">Active ({activeJobs.length})</h2>
              <div className="space-y-2">
                {activeJobs.map((rj) => (
                  <RecurringJobCard key={rj.id} recurringJob={rj} />
                ))}
              </div>
            </div>
          )}

          {inactiveJobs.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-3 text-muted-foreground">Inactive ({inactiveJobs.length})</h2>
              <div className="space-y-2">
                {inactiveJobs.map((rj) => (
                  <RecurringJobCard key={rj.id} recurringJob={rj} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}

type RecurringJobWithCustomer = {
  id: string
  title: string
  description: string | null
  frequency: string
  nextDueDate: Date
  lastGeneratedAt: Date | null
  isActive: boolean
  createdAt: Date
  customer: { id: string; firstName: string; lastName: string | null }
}

function frequencyLabel(frequency: string): string {
  switch (frequency) {
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly'
    case 'biannual': return 'Biannual'
    case 'annual': return 'Annual'
    default: return frequency
  }
}

function RecurringJobCard({ recurringJob }: { recurringJob: RecurringJobWithCustomer }) {
  const isDue = recurringJob.isActive && new Date(recurringJob.nextDueDate) <= new Date()

  return (
    <div>
      <Card className={cn(
        'hover:shadow-md transition-shadow cursor-pointer',
        !recurringJob.isActive && 'opacity-60',
        isDue && 'border-l-4 border-l-amber-500',
      )}>
        <CardContent className="py-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Link href={`/recurring/${recurringJob.id}` as never} className="font-semibold text-sm hover:underline">{recurringJob.title}</Link>
                <Badge variant={recurringJob.isActive ? 'default' : 'secondary'}>
                  {recurringJob.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant="outline">{frequencyLabel(recurringJob.frequency)}</Badge>
                {isDue && <span className="text-xs text-amber-600 font-semibold">Due</span>}
              </div>

              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>Next due: {formatDateOnly(recurringJob.nextDueDate)}</span>
                {recurringJob.lastGeneratedAt && (
                  <span>Last generated: {new Date(recurringJob.lastGeneratedAt).toLocaleDateString()}</span>
                )}
              </div>

              <div className="mt-2 text-xs">
                <Link
                  href={`/customers/${recurringJob.customer.id}` as never}
                  className="text-primary hover:underline"
                >
                  {recurringJob.customer.firstName} {recurringJob.customer.lastName || ''}
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
