'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateEstimateStatus } from './actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
]

export function EstimateStatusForm({ estimateId, currentStatus }: { estimateId: string; currentStatus: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setWarning(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    try {
      const result = await updateEstimateStatus(estimateId, formData)
      if (result.success) {
        setWarning(result.warning ?? null)
        router.refresh()
      } else setError(result.error)
    } catch {
      setError('The connection was interrupted. Refresh to check the current status before trying again.')
    } finally { setLoading(false) }
  }

  if (currentStatus === 'accepted' || currentStatus === 'declined') return <p className="text-sm text-muted-foreground">This estimate is {currentStatus}. Create a new estimate to make changes.</p>

  return (
    <>
      {warning && <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{warning}</p>}
      {error && (
        <div role="alert" className="text-destructive text-sm mb-3">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-3 items-end mt-2">
        <div className="flex-1">
          <Label htmlFor="estimate-status" className="text-sm font-medium">Status</Label>
          <select
            id="estimate-status"
            name="status"
            defaultValue={currentStatus}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {STATUSES.filter(s => currentStatus === 'draft' || s.value !== 'draft').map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? 'Updating...' : 'Update'}
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Choosing Sent sends or retries the customer email.</p>
    </>
  )
}
