'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createMembershipPlan } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const CADENCES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly (every 3 months)' },
  { value: 'biannual', label: 'Biannual (every 6 months)' },
  { value: 'annual', label: 'Annual (every 12 months)' },
]

export function NewMembershipPlanForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await createMembershipPlan(formData)

    if (result.success) {
      router.push('/memberships/plans')
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
          <Label htmlFor="name">Plan name *</Label>
          <Input id="name" name="name" required placeholder="e.g. HVAC Comfort Plan" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={3} placeholder="What's included in this plan..." />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cadence">Billing cadence *</Label>
          <select
            name="cadence"
            id="cadence"
            required
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {CADENCES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="visitsPerYear">Visits per year *</Label>
          <Input id="visitsPerYear" name="visitsPerYear" type="number" min="1" required placeholder="e.g. 2" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">Price (USD) *</Label>
          <Input id="price" name="price" type="number" min="0" step="0.01" required placeholder="e.g. 199.00" />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create plan'}
          </Button>
          <Button variant="ghost" type="button" onClick={() => router.push('/memberships/plans')}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  )
}
