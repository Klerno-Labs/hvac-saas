import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  canEditDispatch,
  DISPATCH_ACTIVE_STATUSES,
  DISPATCH_HOUR_END,
  DISPATCH_HOUR_START,
  DEFAULT_WEEK_ASSIGN_HOUR,
  addDays,
  hourLabel,
  mondayOfWeek,
  slotIsoForTimezone,
  todayKey,
  wallParts,
} from '@/lib/dispatch'
import { DispatchBoard } from './dispatch-board'

type PlacedJob = {
  id: string
  title: string
  customerName: string
  status: string
  technicianId: string
  dayKey: string
  hour: number
}

type UnscheduledJob = {
  id: string
  title: string
  customerName: string
  status: string
}

type Technician = { id: string; name: string; color: string }
type Lane = { hour: number; label: string; iso: string }
type DayCol = { dateKey: string; label: string; iso: string }

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>
}) {
  const { organizationId, organization, role } = await requireActiveSubscription()
  const tz = organization.timezone
  const canEdit = canEditDispatch(role)

  const params = await searchParams
  const view: 'day' | 'week' = params.view === 'week' ? 'week' : 'day'
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date! : todayKey(tz)

  // Active technicians = board columns.
  const technicians: Technician[] = await db.technician.findMany({
    where: { organizationId, active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, color: true },
  })

  // Visible time range + drop lanes (precomputed in the org timezone so the
  // client never does timezone math).
  let lanes: Lane[] = []
  let days: DayCol[] = []
  let rangeStartIso: string
  let rangeEndIso: string

  if (view === 'day') {
    lanes = []
    for (let h = DISPATCH_HOUR_START; h <= DISPATCH_HOUR_END; h++) {
      lanes.push({ hour: h, label: hourLabel(h), iso: slotIsoForTimezone(selectedDate, h, tz) })
    }
    rangeStartIso = slotIsoForTimezone(selectedDate, 0, tz)
    rangeEndIso = slotIsoForTimezone(selectedDate, 24, tz)
  } else {
    const monday = mondayOfWeek(selectedDate)
    const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    for (let i = 0; i < 7; i++) {
      const dk = addDays(monday, i)
      const [, m, d] = dk.split('-')
      days.push({ dateKey: dk, label: `${WEEKDAYS[i]} ${m}/${d}`, iso: slotIsoForTimezone(dk, DEFAULT_WEEK_ASSIGN_HOUR, tz) })
    }
    rangeStartIso = slotIsoForTimezone(monday, 0, tz)
    rangeEndIso = slotIsoForTimezone(addDays(monday, 7), 0, tz)
  }

  const whereActive = { organizationId, status: { in: [...DISPATCH_ACTIVE_STATUSES] } }

  const [placedRows, unscheduledRows] = await Promise.all([
    db.job.findMany({
      where: {
        ...whereActive,
        technicianId: { not: null },
        scheduledFor: { not: null, gte: new Date(rangeStartIso), lt: new Date(rangeEndIso) },
      },
      include: { customer: { select: { firstName: true, lastName: true } } },
      orderBy: { scheduledFor: 'asc' },
    }),
    db.job.findMany({
      where: {
        ...whereActive,
        OR: [{ technicianId: null }, { scheduledFor: null }],
      },
      include: { customer: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ])

  const placed: PlacedJob[] = placedRows.map((j) => {
    const parts = wallParts(j.scheduledFor!.toISOString(), tz)
    return {
      id: j.id,
      title: j.title,
      customerName: `${j.customer.firstName} ${j.customer.lastName || ''}`.trim(),
      status: j.status,
      technicianId: j.technicianId!,
      dayKey: parts.dateKey,
      hour: parts.hour,
    }
  })

  const unscheduled: UnscheduledJob[] = unscheduledRows.map((j) => ({
    id: j.id,
    title: j.title,
    customerName: `${j.customer.firstName} ${j.customer.lastName || ''}`.trim(),
    status: j.status,
  }))

  // Nav helpers
  const step = view === 'day' ? 1 : 7
  const prevDate = addDays(selectedDate, -step)
  const nextDate = addDays(selectedDate, step)
  const today = todayKey(tz)
  const qs = (d: string, v: 'day' | 'week') => `?view=${v}&date=${d}`

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Dispatch</h1>
          {!canEdit && <Badge variant="outline">Read-only</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-input overflow-hidden">
            <Link
              href={`/dispatch${qs(selectedDate, 'day')}` as never}
              className={cn(
                'px-3 py-1 text-xs no-underline',
                view === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Day
            </Link>
            <Link
              href={`/dispatch${qs(selectedDate, 'week')}` as never}
              className={cn(
                'px-3 py-1 text-xs no-underline border-l border-input',
                view === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Week
            </Link>
          </div>

          {/* Date navigation */}
          <Link
            href={`/dispatch${qs(prevDate, view)}` as never}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
          >
            &larr;
          </Link>
          <Link
            href={`/dispatch${qs(today, view)}` as never}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
          >
            Today
          </Link>
          <Link
            href={`/dispatch${qs(nextDate, view)}` as never}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
          >
            &rarr;
          </Link>

          <form action="/dispatch" method="GET" className="flex items-center gap-2">
            <input type="hidden" name="view" value={view} />
            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
            />
            <button
              type="submit"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Go
            </button>
          </form>

          <Link
            href="/settings/technicians"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
          >
            Technicians
          </Link>
        </div>
      </div>

      {technicians.length === 0 ? (
        <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No technicians yet.{' '}
            <Link href="/settings/technicians" className="text-primary hover:underline">
              Add technicians
            </Link>{' '}
            to start dispatching jobs.
          </p>
        </div>
      ) : (
        <DispatchBoard
          view={view}
          dateKey={selectedDate}
          canEdit={canEdit}
          technicians={technicians}
          lanes={lanes}
          days={days}
          placed={placed}
          unscheduled={unscheduled}
        />
      )}
    </main>
  )
}
