'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCustomerEquipment } from './actions'

type PlanOption = {
  id: string
  name: string
  cadence: string
  visitsPerYear: number
}

type CustomerOption = {
  id: string
  firstName: string
  lastName: string | null
  companyName: string | null
}

type EquipmentOption = {
  id: string
  type: string
  make: string | null
  model: string | null
  serial: string | null
}

export function EnrollMembershipForm({
  plans,
  customers,
}: {
  plans: PlanOption[]
  customers: CustomerOption[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [equipment, setEquipment] = useState<EquipmentOption[]>([])
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([])

  async function handleCustomerChange(customerId: string) {
    setSelectedEquipment([])
    if (!customerId) {
      setEquipment([])
      return
    }
    const items = await getCustomerEquipment(customerId)
    setEquipment(items)
  }

  function toggleEquipment(id: string) {
    setSelectedEquipment((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const body = {
      planId: formData.get('planId') as string,
      customerId: formData.get('customerId') as string,
      startDate: formData.get('startDate') as string,
      equipmentIds: selectedEquipment,
    }

    const res = await fetch('/api/memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      router.push('/memberships')
    } else {
      const data = await res.json()
      setError(data.error ?? 'Failed to enroll membership')
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
          <Label htmlFor="planId">Plan *</Label>
          <select
            name="planId"
            id="planId"
            required
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            <option value="">Select a plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.cadence}, {p.visitsPerYear} visits/yr
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customerId">Customer *</Label>
          <select
            name="customerId"
            id="customerId"
            required
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            onChange={(e) => handleCustomerChange(e.target.value)}
          >
            <option value="">Select a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName || ''}{c.companyName ? ` (${c.companyName})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="startDate">Start date *</Label>
          <Input id="startDate" name="startDate" type="date" required />
        </div>

        {equipment.length > 0 && (
          <div className="space-y-2">
            <Label>Covered equipment</Label>
            <div className="space-y-1 rounded-md border p-3">
              {equipment.map((eq) => (
                <label key={eq.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEquipment.includes(eq.id)}
                    onChange={() => toggleEquipment(eq.id)}
                    className="h-4 w-4"
                  />
                  <span>
                    {eq.type}{eq.make ? ` — ${eq.make}` : ''}{eq.model ? ` ${eq.model}` : ''}
                    {eq.serial ? ` (${eq.serial})` : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Enrolling...' : 'Enroll'}
          </Button>
          <Button variant="ghost" type="button" onClick={() => router.push('/memberships')}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  )
}
