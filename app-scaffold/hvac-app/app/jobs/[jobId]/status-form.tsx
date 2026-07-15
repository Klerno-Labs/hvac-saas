'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateJobStatus } from './actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'booked', label: 'Booked' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function JobStatusForm({ jobId, currentStatus }: { jobId: string; currentStatus: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await updateJobStatus(jobId, formData)

    if (result.success) {
      router.refresh()
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  return (
    <>
      {error && (
        <div className="text-sm text-destructive mb-3 p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-3 items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={currentStatus}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? 'Updating...' : 'Update'}
        </Button>
      </form>
    </>
  )
}
