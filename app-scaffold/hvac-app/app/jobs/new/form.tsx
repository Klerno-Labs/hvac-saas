'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createJob } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type CustomerOption = {
  id: string
  firstName: string
  lastName: string | null
  companyName: string | null
}

type TechnicianOption = {
  id: string
  name: string
}

export function NewJobForm({
  customers,
  technicians,
  preselectedCustomerId,
}: {
  customers: CustomerOption[]
  technicians: TechnicianOption[]
  preselectedCustomerId?: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await createJob(formData)

    if (result.success) {
      router.push(`/jobs/${result.jobId}`)
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customerId">Customer *</Label>
          <select
            id="customerId"
            name="customerId"
            required
            defaultValue={preselectedCustomerId || ''}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName || ''}{c.companyName ? ` — ${c.companyName}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">Job title *</Label>
          <Input id="title" name="title" type="text" required placeholder="e.g. AC unit repair" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheduledFor">Scheduled date</Label>
          <Input id="scheduledFor" name="scheduledFor" type="date" />
        </div>
        {technicians.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="technicianId">Technician</Label>
            <select
              id="technicianId"
              name="technicianId"
              defaultValue=""
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">No technician assigned</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create job'}
          </Button>
          <Button variant="ghost" type="button" onClick={() => router.push('/jobs')}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  )
}
