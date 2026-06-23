import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getTodayBounds, formatCustomerAddress, buildMapsUrl, fieldStatusVariant, fieldStatusLabel } from '@/lib/field'

export default async function FieldHubPage() {
  const { userId, organizationId, organization } = await requireActiveSubscription()

  const { start, end } = getTodayBounds(organization.timezone)

  // Technicians see ONLY jobs assigned to them. "Today" = scheduled today OR
  // currently in an active field state (en_route / on_site) so a job in
  // progress is never lost across midnight.
  const jobs = await db.job.findMany({
    where: {
      organizationId,
      technicianUserId: userId,
      OR: [
        { scheduledFor: { gte: start, lte: end } },
        { fieldStatus: { in: ['en_route', 'on_site'] } },
      ],
    },
    include: { customer: true },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
  })

  const active = jobs.filter((j) => j.fieldStatus === 'en_route' || j.fieldStatus === 'on_site')
  const upcoming = jobs.filter((j) => j.fieldStatus !== 'en_route' && j.fieldStatus !== 'on_site' && j.fieldStatus !== 'done')
  const done = jobs.filter((j) => j.fieldStatus === 'done')

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Field hub</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {jobs.length} job{jobs.length === 1 ? '' : 's'} assigned to you today
        </p>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">No jobs assigned to you for today.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                In progress
              </h2>
              <div className="space-y-2">
                {active.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Upcoming
              </h2>
              <div className="space-y-2">
                {upcoming.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Completed
              </h2>
              <div className="space-y-2">
                {done.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}

function JobCard({
  job,
}: {
  job: {
    id: string
    title: string
    scheduledFor: Date | null
    fieldStatus: string
    customer: {
      firstName: string
      lastName: string | null
      phone: string | null
      addressLine1: string | null
      addressLine2: string | null
      city: string | null
      state: string | null
      postalCode: string | null
    }
  }
}) {
  const address = formatCustomerAddress(job.customer)
  const mapsUrl = buildMapsUrl(address)

  return (
    <Card>
      <CardContent className="py-4 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link href={`/field/${job.id}` as never} className="no-underline text-inherit">
              <span className="font-semibold block truncate">{job.title}</span>
            </Link>
            <p className="text-sm text-muted-foreground truncate">
              {job.customer.firstName} {job.customer.lastName || ''}
            </p>
          </div>
          <Badge variant={fieldStatusVariant(job.fieldStatus)}>
            {fieldStatusLabel(job.fieldStatus)}
          </Badge>
        </div>

        {address && <p className="text-sm mt-2">{address}</p>}

        {job.scheduledFor && (
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(job.scheduledFor).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        )}

        <div className="flex gap-2 mt-3">
          <Link
            href={`/field/${job.id}` as never}
            className={cn(buttonVariants({ size: 'sm' }), 'no-underline flex-1')}
          >
            Open
          </Link>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline flex-1')}
            >
              Navigate
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
