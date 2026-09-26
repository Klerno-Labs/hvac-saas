import { startOfBusinessDayAsUtcDate } from '@/lib/format'
import { jobAccessWhere } from '@/lib/mutation-access'
import { requireAuth } from '@/lib/session'
import { db } from '@/lib/db'
import FieldJobCard from './job-card'

export default async function FieldPage() {
  const context = await requireAuth()

  const todayStart = startOfBusinessDayAsUtcDate(new Date(), context.organization.timezone)
  const todayEnd = new Date(todayStart)
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1)

  const jobs = await db.job.findMany({
    where: {
      ...jobAccessWhere(context),
      scheduledFor: { gte: todayStart, lt: todayEnd },
      status: { in: ['scheduled', 'in_progress', 'completed'] },
    },
    include: {
      customer: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
        },
      },
      assets: { orderBy: { createdAt: 'asc' }, select: { id: true, fileUrl: true } },
      jobNotes: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, authorName: true, body: true },
      },
    },
    orderBy: { scheduledFor: 'asc' },
  })

  const dateLabel = todayStart.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-1">Today&apos;s Jobs</h1>
      <p className="text-sm text-muted-foreground mb-6">{dateLabel}</p>
      {jobs.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">No jobs scheduled for today.</p>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <FieldJobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </main>
  )
}
