'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { assignJob } from './actions'

type Member = { id: string; name: string }

type DispatchJob = {
  id: string
  title: string
  status: string
  scheduledFor: string | null
  technicianId: string | null
  customerName: string
}

interface Props {
  date: string
  members: Member[]
  boardJobs: DispatchJob[]
  unscheduledJobs: DispatchJob[]
  canDispatch: boolean
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7) // 7 AM – 6 PM

function formatHour(h: number): string {
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function toDateStr(dt: Date): string {
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0'),
  ].join('-')
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default'
  if (status === 'cancelled') return 'destructive'
  if (status === 'in_progress') return 'outline'
  return 'secondary'
}

export function DispatchBoard({
  date,
  members,
  boardJobs,
  unscheduledJobs,
  canDispatch,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overCell, setOverCell] = useState<string | null>(null)

  function doAssign(
    jobId: string,
    technicianId: string | null,
    scheduledFor: string | null,
  ) {
    startTransition(async () => {
      await assignJob({ jobId, technicianId, scheduledFor })
      router.refresh()
    })
    setDraggingId(null)
    setOverCell(null)
  }

  function onDrop(e: React.DragEvent, techId: string, hour: number) {
    e.preventDefault()
    if (!draggingId) return
    const [y, m, d] = date.split('-').map(Number)
    const scheduledFor = new Date(y, m - 1, d, hour, 0, 0).toISOString()
    doAssign(draggingId, techId, scheduledFor)
  }

  function onDropQueue(e: React.DragEvent) {
    e.preventDefault()
    if (!draggingId) return
    doAssign(draggingId, null, null)
  }

  const [y, m, d] = date.split('-').map(Number)
  const prevDate = new Date(y, m - 1, d - 1)
  const nextDate = new Date(y, m - 1, d + 1)
  const dateLabel = new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className={isPending ? 'pointer-events-none opacity-60' : ''}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold">Dispatch Board</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/dispatch?date=${toDateStr(prevDate)}` as never}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted no-underline"
          >
            ← Prev
          </Link>
          <input
            type="date"
            value={date}
            onChange={(e) => router.push(`/dispatch?date=${e.target.value}`)}
            className="border rounded-md px-2 py-1 text-sm"
            aria-label="Select date"
          />
          <Link
            href={`/dispatch?date=${toDateStr(nextDate)}` as never}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted no-underline"
          >
            Next →
          </Link>
        </div>
        <span className="text-sm text-muted-foreground">{dateLabel}</span>
        {!canDispatch && (
          <span className="text-xs text-muted-foreground italic">View only</span>
        )}
      </div>

      <div className="flex gap-4" style={{ height: 'calc(100vh - 210px)' }}>
        {/* Unscheduled queue */}
        <aside
          className={`w-52 shrink-0 flex flex-col border rounded-lg overflow-hidden transition-colors ${
            canDispatch && draggingId ? 'border-primary/60 bg-primary/5' : ''
          }`}
          onDragOver={canDispatch ? (e) => e.preventDefault() : undefined}
          onDrop={canDispatch ? onDropQueue : undefined}
        >
          <p className="px-3 py-2 text-xs font-semibold border-b bg-muted/40 shrink-0">
            Unscheduled ({unscheduledJobs.length})
          </p>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {unscheduledJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isDragging={draggingId === job.id}
                draggable={canDispatch}
                onDragStart={() => setDraggingId(job.id)}
                onDragEnd={() => {
                  setDraggingId(null)
                  setOverCell(null)
                }}
              />
            ))}
            {unscheduledJobs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                All jobs scheduled
              </p>
            )}
          </div>
        </aside>

        {/* Timeline */}
        <div className="flex-1 border rounded-lg overflow-auto">
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
              <p>No team members found.</p>
              <Link href="/settings/team" className="underline text-xs">
                Add members in Settings → Team
              </Link>
            </div>
          ) : (
            <table
              className="border-collapse text-sm"
              style={{ width: '100%', minWidth: `${80 + members.length * 160}px` }}
            >
              <thead>
                <tr className="sticky top-0 z-10 bg-card border-b">
                  <th className="w-20 border-r px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Time
                  </th>
                  {members.map((m) => (
                    <th
                      key={m.id}
                      className="border-r last:border-r-0 px-3 py-2 text-left text-xs font-semibold"
                    >
                      {m.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map((hour) => (
                  <tr key={hour} className="border-b last:border-b-0">
                    <td className="border-r px-3 py-2 text-xs text-muted-foreground whitespace-nowrap align-top">
                      {formatHour(hour)}
                    </td>
                    {members.map((m) => {
                      const cellKey = `${m.id}-${hour}`
                      const isOver = overCell === cellKey
                      const cellJobs = boardJobs.filter(
                        (j) =>
                          j.technicianId === m.id &&
                          j.scheduledFor !== null &&
                          new Date(j.scheduledFor).getHours() === hour,
                      )
                      return (
                        <td
                          key={cellKey}
                          className={`border-r last:border-r-0 p-1 align-top transition-colors ${
                            isOver
                              ? 'bg-primary/10'
                              : canDispatch && draggingId
                              ? 'hover:bg-muted/40'
                              : ''
                          }`}
                          style={{ minHeight: 56 }}
                          onDragOver={
                            canDispatch
                              ? (e) => {
                                  e.preventDefault()
                                  setOverCell(cellKey)
                                }
                              : undefined
                          }
                          onDragLeave={
                            canDispatch
                              ? (e) => {
                                  const rt = e.relatedTarget as Node | null
                                  if (!rt || !e.currentTarget.contains(rt)) setOverCell(null)
                                }
                              : undefined
                          }
                          onDrop={canDispatch ? (e) => onDrop(e, m.id, hour) : undefined}
                        >
                          <div className="space-y-1 min-h-[52px]">
                            {cellJobs.map((job) => (
                              <JobCard
                                key={job.id}
                                job={job}
                                isDragging={draggingId === job.id}
                                draggable={canDispatch}
                                onDragStart={() => setDraggingId(job.id)}
                                onDragEnd={() => {
                                  setDraggingId(null)
                                  setOverCell(null)
                                }}
                              />
                            ))}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function JobCard({
  job,
  isDragging,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  job: DispatchJob
  isDragging: boolean
  draggable: boolean
  onDragStart: () => void
  onDragEnd: () => void
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={`rounded border bg-card p-1.5 select-none transition-opacity ${
        isDragging ? 'opacity-40' : 'opacity-100'
      } ${draggable ? 'cursor-grab active:cursor-grabbing hover:shadow-sm' : ''}`}
    >
      <Link
        href={`/jobs/${job.id}` as never}
        draggable={false}
        className="no-underline block"
      >
        <p className="text-xs font-semibold truncate text-foreground">{job.title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{job.customerName}</p>
      </Link>
      <Badge
        variant={statusVariant(job.status)}
        className="mt-1 text-[10px] py-0 px-1.5"
      >
        {job.status.replace('_', ' ')}
      </Badge>
    </div>
  )
}
