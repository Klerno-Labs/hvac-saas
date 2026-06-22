'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignTechnician } from './actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type TechnicianOption = {
  id: string
  name: string
}

export function TechnicianAssignForm({
  jobId,
  technicians,
  currentTechnicianId,
}: {
  jobId: string
  technicians: TechnicianOption[]
  currentTechnicianId: string | null
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await assignTechnician(jobId, formData)

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
          <Label htmlFor="technicianId">Technician</Label>
          <select
            id="technicianId"
            name="technicianId"
            defaultValue={currentTechnicianId || ''}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">No technician assigned</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </form>
    </>
  )
}
