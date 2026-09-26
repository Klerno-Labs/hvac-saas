import { startOfBusinessDayAsUtcDate } from '@/lib/format'
import { jobAccessWhere } from '@/lib/mutation-access'
import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const context = await requireActiveSubscription()
  const params = await searchParams

  // Determine displayed month
  const now = startOfBusinessDayAsUtcDate(new Date(), context.organization.timezone)
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth() // 0-indexed

  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const [y, m] = params.month.split('-').map(Number)
    if (Number.isInteger(y) && y >= 1000 && y <= 9998 && m >= 1 && m <= 12) {
      year = y
      month = m - 1
    }
  }

  // First and last day of the month
  const firstOfMonth = new Date(Date.UTC(year, month, 1))
  const lastOfMonth = new Date(Date.UTC(year, month + 1, 0))

  // Fetch jobs scheduled in this month
  const jobs = await db.job.findMany({
    where: {
      ...jobAccessWhere(context),
      scheduledFor: {
        gte: firstOfMonth,
        lt: new Date(Date.UTC(year, month + 1, 1)),
      },
    },
    select: {
      id: true,
      title: true,
      status: true,
      scheduledFor: true,
    },
    orderBy: { scheduledFor: 'asc' },
  })

  // Group jobs by day of month
  const jobsByDay: Record<number, typeof jobs> = {}
  for (const job of jobs) {
    if (job.scheduledFor) {
      const day = new Date(job.scheduledFor).getUTCDate()
      if (!jobsByDay[day]) jobsByDay[day] = []
      jobsByDay[day].push(job)
    }
  }

  // Build calendar grid
  const startDayOfWeek = firstOfMonth.getUTCDay() // 0=Sunday
  const daysInMonth = lastOfMonth.getUTCDate()
  const totalCells = Math.ceil((startDayOfWeek + daysInMonth) / 7) * 7

  // Navigation
  const prevMonth = month === 0 ? 12 : month
  const prevYear = month === 0 ? year - 1 : year
  const nextMonth = month === 11 ? 1 : month + 2
  const nextYear = month === 11 ? year + 1 : year
  const prevHref = `/calendar?month=${prevYear}-${String(prevMonth).padStart(2, '0')}`
  const nextHref = `/calendar?month=${nextYear}-${String(nextMonth).padStart(2, '0')}`

  const monthLabel = firstOfMonth.toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  })

  const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <Link
            href={prevHref as never}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
          >
            &larr; Prev
          </Link>
          <span className="text-sm font-semibold min-w-[160px] text-center">
            {monthLabel}
          </span>
          <Link
            href={nextHref as never}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
          >
            Next &rarr;
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b">
            {DAYS_OF_WEEK.map((d) => (
              <div
                key={d}
                className="text-center text-xs font-semibold text-muted-foreground py-2 border-r last:border-r-0"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7">
            {Array.from({ length: totalCells }, (_, i) => {
              const dayNum = i - startDayOfWeek + 1
              const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth
              const isToday =
                isCurrentMonth &&
                dayNum === now.getUTCDate() &&
                month === now.getUTCMonth() &&
                year === now.getUTCFullYear()
              const dayJobs = isCurrentMonth ? jobsByDay[dayNum] || [] : []

              return (
                <div
                  key={i}
                  className={cn(
                    'min-h-[90px] border-r border-b last:border-r-0 p-1.5',
                    !isCurrentMonth && 'bg-muted/30'
                  )}
                >
                  {isCurrentMonth && (
                    <>
                      <span
                        className={cn(
                          'text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full',
                          isToday && 'bg-primary text-primary-foreground'
                        )}
                      >
                        {dayNum}
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {dayJobs.map((job) => (
                          <Link
                            key={job.id}
                            href={`/jobs/${job.id}` as never}
                            className="no-underline block"
                          >
                            <Badge
                              variant={jobBadgeVariant(job.status)}
                              className="text-[10px] leading-tight px-1.5 py-0.5 truncate max-w-full block cursor-pointer hover:opacity-80"
                            >
                              {job.title}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

function jobBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default'
    case 'cancelled':
      return 'destructive'
    case 'in_progress':
      return 'outline'
    default:
      return 'secondary'
  }
}
