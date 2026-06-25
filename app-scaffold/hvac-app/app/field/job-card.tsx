'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { updateFieldJobStatus, addFieldNote } from './actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { FieldJobStatus } from '@/lib/field/types'

type Note = { id: string; authorName: string | null; body: string }
type Asset = { id: string; fileUrl: string }
type Customer = {
  firstName: string
  lastName: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  phone: string | null
}

export type FieldJobCardProps = {
  id: string
  title: string
  status: string
  scheduledFor: Date | null
  customer: Customer
  assets: Asset[]
  jobNotes: Note[]
}

const STEPS: { label: string; status: FieldJobStatus }[] = [
  { label: 'En Route', status: 'scheduled' },
  { label: 'On Site', status: 'in_progress' },
  { label: 'Complete', status: 'completed' },
]

function formatAddress(c: Customer): string {
  const line2 = c.addressLine2 ? `, ${c.addressLine2}` : ''
  const cityState = [c.city, c.state].filter(Boolean).join(', ')
  return [c.addressLine1 ? `${c.addressLine1}${line2}` : null, cityState, c.postalCode]
    .filter(Boolean)
    .join(', ')
}

function mapsUrl(c: Customer): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(formatAddress(c))}`
}

export default function FieldJobCard({ job }: { job: FieldJobCardProps }) {
  const router = useRouter()
  const [statusPending, setStatusPending] = useState(false)
  const [noteBody, setNoteBody] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [notePending, setNotePending] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const currentStepIdx = STEPS.findIndex((s) => s.status === job.status)
  const address = formatAddress(job.customer)

  async function handleStatusClick(status: FieldJobStatus) {
    setStatusPending(true)
    await updateFieldJobStatus(job.id, status)
    router.refresh()
    setStatusPending(false)
  }

  async function handleNoteSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!noteBody.trim()) return
    setNoteError(null)
    setNotePending(true)
    const clientId = crypto.randomUUID()
    const result = await addFieldNote(job.id, noteBody, clientId)
    if (result.success) {
      setNoteBody('')
      router.refresh()
    } else {
      setNoteError(result.error)
    }
    setNotePending(false)
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError(null)
    setPhotoUploading(true)
    try {
      const fd = new FormData()
      fd.append('jobId', job.id)
      fd.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setPhotoError((body as { error?: string }).error ?? 'Upload failed')
        return
      }
      const data = await res.json() as { presignedUrl?: string; fileUrl: string }
      if (data.presignedUrl) {
        const put = await fetch(data.presignedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        if (!put.ok) {
          setPhotoError('Storage upload failed')
          return
        }
      }
      router.refresh()
    } catch {
      setPhotoError('Upload failed')
    } finally {
      setPhotoUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{job.title}</CardTitle>
          <Badge
            variant={
              job.status === 'completed'
                ? 'default'
                : job.status === 'in_progress'
                  ? 'outline'
                  : 'secondary'
            }
            className="shrink-0"
          >
            {job.status === 'scheduled'
              ? 'En Route'
              : job.status === 'in_progress'
                ? 'On Site'
                : 'Complete'}
          </Badge>
        </div>
        <p className="text-sm font-medium">
          {job.customer.firstName} {job.customer.lastName ?? ''}
          {job.customer.phone && (
            <a href={`tel:${job.customer.phone}`} className="ml-2 text-primary underline font-normal text-xs">
              {job.customer.phone}
            </a>
          )}
        </p>
        {address && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="flex-1">{address}</span>
            <a
              href={mapsUrl(job.customer)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline shrink-0"
            >
              Navigate
            </a>
          </div>
        )}
        {job.scheduledFor && (
          <p className="text-xs text-muted-foreground">
            {new Date(job.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status stepper */}
        <div className="grid grid-cols-3 gap-1.5">
          {STEPS.map((step, idx) => {
            const isCurrent = idx === currentStepIdx
            const isPast = idx < currentStepIdx
            const isFuture = idx > currentStepIdx
            return (
              <button
                key={step.status}
                type="button"
                disabled={!isFuture || statusPending}
                onClick={() => isFuture && handleStatusClick(step.status)}
                className={[
                  'rounded-lg py-2 px-1 text-xs font-medium border transition-colors',
                  isCurrent
                    ? 'bg-primary text-primary-foreground border-primary'
                    : isPast
                      ? 'bg-muted text-muted-foreground border-muted'
                      : 'border-primary text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed',
                ].join(' ')}
              >
                {step.label}
              </button>
            )
          })}
        </div>

        {/* Notes */}
        {job.jobNotes.length > 0 && (
          <div className="space-y-1.5">
            {job.jobNotes.map((note) => (
              <div key={note.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                {note.authorName && (
                  <span className="text-xs font-medium text-muted-foreground mr-1">{note.authorName}:</span>
                )}
                {note.body}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleNoteSubmit} className="flex gap-2">
          <input
            type="text"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Add a note…"
            className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs placeholder:text-muted-foreground"
          />
          <Button type="submit" size="sm" disabled={!noteBody.trim() || notePending}>
            Save
          </Button>
        </form>
        {noteError && <p className="text-xs text-destructive">{noteError}</p>}

        {/* Photos */}
        <div>
          {job.assets.length > 0 && (
            <div className="grid grid-cols-3 gap-1 mb-2">
              {job.assets.map((asset) => (
                <a
                  key={asset.id}
                  href={asset.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square rounded overflow-hidden bg-muted"
                >
                  <img src={asset.fileUrl} alt="Job photo" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={photoUploading}
            onClick={() => fileRef.current?.click()}
          >
            {photoUploading ? 'Uploading…' : job.assets.length === 0 ? 'Add Before Photo' : 'Add Photo'}
          </Button>
          {photoError && <p className="text-xs text-destructive mt-1">{photoError}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
