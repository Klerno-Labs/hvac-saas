'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { assignJob, unassignJob } from './actions'
import { DISPATCH_HOUR_END, DISPATCH_HOUR_START } from '@/lib/dispatch'

type Technician = { id: string; name: string; color: string }
type Lane = { hour: number; label: string; iso: string }
type DayCol = { dateKey: string; label: string; iso: string }
type PlacedJob = {
  id: string
  title: string
  customerName: string
  status: string
  technicianId: string
  dayKey: string
  hour: number
}
type UnscheduledJob = { id: string; title: string; customerName: string; status: string }

type Props = {
  view: 'day' | 'week'
  dateKey: string
  canEdit: boolean
  technicians: Technician[]
  lanes: Lane[]
  days: DayCol[]
  placed: PlacedJob[]
  unscheduled: UnscheduledJob[]
}

export function DispatchBoard({
  view,
  dateKey,
  canEdit,
  technicians,
  lanes,
  days,
  placed,
  unscheduled,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [dragJobId, setDragJobId] = useState<string | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onDragStart(e: React.DragEvent, jobId: string) {
    if (!canEdit) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/plain', jobId)
    e.dataTransfer.effectAllowed = 'move'
    setDragJobId(jobId)
  }

  function onDragEnd() {
    setDragJobId(null)
    setHoverKey(null)
  }

  function onCellDragOver(e: React.DragEvent, key: string) {
    if (!canEdit || pending) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (hoverKey !== key) setHoverKey(key)
  }

  function onCellDrop(
    e: React.DragEvent,
    key: string,
    technicianId: string,
    scheduledForIso: string
  ) {
    e.preventDefault()
    setHoverKey(null)
    if (!canEdit || pending) return
    const jobId = e.dataTransfer.getData('text/plain') || dragJobId
    if (!jobId) return

    startTransition(async () => {
      const result = await assignJob({ jobId, technicianId, scheduledFor: scheduledForIso })
      if (result.success) {
        setError(null)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function onQueueDrop(e: React.DragEvent) {
    e.preventDefault()
    setHoverKey(null)
    if (!canEdit || pending) return
    const jobId = e.dataTransfer.getData('text/plain') || dragJobId
    if (!jobId) return

    startTransition(async () => {
      const result = await unassignJob(jobId)
      if (result.success) {
        setError(null)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function jobsForCell(techId: string, match: { dayKey?: string; hour?: number }) {
    return placed.filter((p) => {
      if (p.technicianId !== techId) return false
      if (match.dayKey !== undefined && p.dayKey !== match.dayKey) return false
      if (match.hour !== undefined && p.hour !== match.hour) return false
      return true
    })
  }

  function offHoursJobs(techId: string) {
    return placed.filter(
      (p) =>
        p.technicianId === techId &&
        p.dayKey === dateKey &&
        (p.hour < DISPATCH_HOUR_START || p.hour > DISPATCH_HOUR_END)
    )
  }

  const gridCols = `64px repeat(${technicians.length}, minmax(180px, 1fr))`

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center justify-between text-sm text-destructive p-3 bg-destructive/10 rounded-lg">
          <span>{error}</span>
          <button className="text-xs underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {pending && (
        <div className="text-xs text-muted-foreground">Saving…</div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Unscheduled queue */}
        <aside
          className="lg:w-72 shrink-0"
          onDragOver={(e) => {
            if (canEdit && !pending) e.preventDefault()
          }}
          onDrop={onQueueDrop}
        >
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden">
            <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between">
              <span className="text-sm font-semibold">Unscheduled</span>
              <Badge variant="secondary">{unscheduled.length}</Badge>
            </div>
            <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
              {unscheduled.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No jobs waiting. Drag a scheduled job here to unschedule it.
                </p>
              ) : (
                unscheduled.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    canEdit={canEdit}
                    dragging={dragJobId === job.id}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                  />
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Board grid */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="min-w-max">
            {/* Header row */}
            <div className="grid" style={{ gridTemplateColumns: gridCols }}>
              <div className="text-xs font-semibold text-muted-foreground px-2 py-2">
                {view === 'day' ? 'Time' : 'Day'}
              </div>
              {technicians.map((t) => (
                <div key={t.id} className="px-2 py-2 border-l">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="text-sm font-semibold truncate">{t.name}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Rows */}
            {view === 'day'
              ? lanes.map((lane) => (
                  <BoardRow
                    key={lane.hour}
                    label={lane.label}
                    gridCols={gridCols}
                  >
                    {technicians.map((t) => {
                      const key = `${t.id}-${lane.iso}`
                      const jobs = jobsForCell(t.id, { hour: lane.hour })
                      return (
                        <DropCell
                          key={t.id}
                          label={key}
                          active={hoverKey === key}
                          onDragOver={(e) => onCellDragOver(e, key)}
                          onDragLeave={() => setHoverKey(null)}
                          onDrop={(e) => onCellDrop(e, key, t.id, lane.iso)}
                          canEdit={canEdit}
                        >
                          {jobs.map((job) => (
                            <JobCard
                              key={job.id}
                              job={job}
                              canEdit={canEdit}
                              dragging={dragJobId === job.id}
                              onDragStart={onDragStart}
                              onDragEnd={onDragEnd}
                            />
                          ))}
                        </DropCell>
                      )
                    })}
                  </BoardRow>
                ))
              : days.map((day) => (
                  <BoardRow key={day.dateKey} label={day.label} gridCols={gridCols}>
                    {technicians.map((t) => {
                      const key = `${t.id}-${day.iso}`
                      const jobs = jobsForCell(t.id, { dayKey: day.dateKey })
                      return (
                        <DropCell
                          key={t.id}
                          label={key}
                          active={hoverKey === key}
                          onDragOver={(e) => onCellDragOver(e, key)}
                          onDragLeave={() => setHoverKey(null)}
                          onDrop={(e) => onCellDrop(e, key, t.id, day.iso)}
                          canEdit={canEdit}
                        >
                          {jobs.map((job) => (
                            <JobCard
                              key={job.id}
                              job={job}
                              canEdit={canEdit}
                              dragging={dragJobId === job.id}
                              onDragStart={onDragStart}
                              onDragEnd={onDragEnd}
                            />
                          ))}
                        </DropCell>
                      )
                    })}
                  </BoardRow>
                ))}

            {/* Off-hours row (day view only) */}
            {view === 'day' &&
              technicians.some((t) => offHoursJobs(t.id).length > 0) && (
                <BoardRow label="Other" gridCols={gridCols}>
                  {technicians.map((t) => (
                    <div
                      key={t.id}
                      className="border-l border-t min-h-[44px] p-1 bg-muted/20"
                    >
                      {offHoursJobs(t.id).map((job) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          canEdit={canEdit}
                          dragging={dragJobId === job.id}
                          onDragStart={onDragStart}
                          onDragEnd={onDragEnd}
                        />
                      ))}
                    </div>
                  ))}
                </BoardRow>
              )}
          </div>
        </div>
      </div>
    </div>
  )
}

function BoardRow({
  label,
  gridCols,
  children,
}: {
  label: string
  gridCols: string
  children: React.ReactNode
}) {
  return (
    <div className="grid border-t" style={{ gridTemplateColumns: gridCols }}>
      <div className="text-xs text-muted-foreground px-2 py-1.5 flex items-start">
        {label}
      </div>
      {children}
    </div>
  )
}

function DropCell({
  label,
  active,
  canEdit,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  label: string
  active: boolean
  canEdit: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  children: React.ReactNode
}) {
  return (
    <div
      data-cell={label}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'border-l border-t min-h-[56px] p-1 space-y-1 transition-colors',
        canEdit && 'hover:bg-muted/30',
        active && 'bg-primary/10 ring-1 ring-inset ring-primary/40'
      )}
    >
      {children}
    </div>
  )
}

function JobCard({
  job,
  canEdit,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  job: { id: string; title: string; customerName: string; status: string }
  canEdit: boolean
  dragging: boolean
  onDragStart: (e: React.DragEvent, jobId: string) => void
  onDragEnd: () => void
}) {
  return (
    <Link
      href={`/jobs/${job.id}` as never}
      draggable={canEdit}
      onDragStart={(e) => onDragStart(e, job.id)}
      onDragEnd={onDragEnd}
      className={cn(
        'block no-underline rounded-md p-1.5 text-xs ring-1 transition-opacity cursor-grab',
        'bg-card hover:bg-muted/40',
        dragging && 'opacity-40'
      )}
    >
      <div className="font-medium text-foreground truncate">{job.title}</div>
      {job.customerName && (
        <div className="text-muted-foreground truncate">{job.customerName}</div>
      )}
      <Badge
        variant={statusVariant(job.status)}
        className="mt-0.5 text-[10px] px-1 py-0"
      >
        {job.status.replace('_', ' ')}
      </Badge>
    </Link>
  )
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'in_progress':
      return 'outline'
    case 'cancelled':
      return 'destructive'
    case 'completed':
      return 'default'
    default:
      return 'secondary'
  }
}
