import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Pagination } from '@/app/components/pagination'
import { SearchInput } from '@/app/components/search-input'
import { canDo } from '@/lib/permissions'

const PAGE_SIZE = 20

const JOB_STATUSES = ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'] as const

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>
}) {
  const { organizationId, userId, role } = await requireActiveSubscription()
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const q = params.q?.trim() || ''
  const statusFilter = params.status || ''

  const where: Record<string, unknown> = { organizationId }
  if (role === 'technician') {
    where.assignedUserId = userId
  }

  if (statusFilter && JOB_STATUSES.includes(statusFilter as (typeof JOB_STATUSES)[number])) {
    where.status = statusFilter
  }

  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { customer: { firstName: { contains: q, mode: 'insensitive' } } },
      { customer: { lastName: { contains: q, mode: 'insensitive' } } },
    ]
  }

  const [jobs, totalCount] = await Promise.all([
    db.job.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.job.count({ where }),
  ])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const spParams: Record<string, string> = {}
  if (q) spParams.q = q
  if (statusFilter) spParams.status = statusFilter

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
        {canDo(role, 'manageJobs') && (
          <Link href="/jobs/new" className={cn(buttonVariants(), 'no-underline')}>New job</Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <SearchInput
          action="/jobs"
          defaultValue={q}
          placeholder="Search by title or customer name..."
          hiddenInputs={statusFilter ? { status: statusFilter } : undefined}
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <Link href="/jobs">
          <Badge variant={!statusFilter ? 'default' : 'outline'} className="cursor-pointer">All</Badge>
        </Link>
        {JOB_STATUSES.map((s) => (
          <Link key={s} href={`/jobs?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ''}`}>
            <Badge variant={statusFilter === s ? 'default' : 'outline'} className="cursor-pointer">
              {s.replace('_', ' ')}
            </Badge>
          </Link>
        ))}
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {q || statusFilter ? 'No jobs match your filters.' : 'No jobs yet. Create your first job to get started.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {jobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}` as never} className="no-underline text-inherit">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold">{job.title}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {job.customer.firstName} {job.customer.lastName || ''}
                        </span>
                      </div>
                      <Badge variant={statusVariant(job.status)}>{job.status.replace('_', ' ')}</Badge>
                    </div>
                    {job.scheduledFor && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Scheduled: {new Date(job.scheduledFor).toLocaleDateString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} basePath="/jobs" searchParams={spParams} />
        </>
      )}
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
