'use client'

import { useState } from 'react'
import { submitBooking } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, TIME_WINDOWS, TIME_WINDOW_LABELS } from '@/lib/lead-source'

type OrgInfo = {
  name: string
  phone: string | null
  email: string | null
}

export function BookingForm({ slug, organization }: { slug: string; organization: OrgInfo }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await submitBooking(slug, formData)

    setLoading(false)
    if (result.success) {
      setDone(true)
    } else {
      setError(result.error)
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-6 text-center">
        <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">Request received</h2>
        <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-2">
          Thanks — {organization.name} has your request and will reach out to confirm an appointment.
        </p>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Honeypot: hidden from humans, tempting for bots */}
        <div className="hidden" aria-hidden="true">
          <Label htmlFor="companyUrl">Company website</Label>
          <Input id="companyUrl" name="companyUrl" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name *</Label>
            <Input id="firstName" name="firstName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" name="lastName" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" placeholder="(555) 555-5555" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">Provide at least a phone number or email.</p>

        <div className="space-y-2">
          <Label htmlFor="addressLine1">Service address</Label>
          <Input id="addressLine1" name="addressLine1" placeholder="Street address" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input id="state" name="state" maxLength={2} placeholder="TX" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalCode">ZIP</Label>
            <Input id="postalCode" name="postalCode" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="serviceType">What do you need? *</Label>
          <select
            id="serviceType"
            name="serviceType"
            required
            defaultValue=""
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="" disabled>Select a service</option>
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>{SERVICE_TYPE_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="preferredDate">Preferred date</Label>
            <Input id="preferredDate" name="preferredDate" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferredWindow">Preferred time</Label>
            <select
              id="preferredWindow"
              name="preferredWindow"
              defaultValue="anytime"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {TIME_WINDOWS.map((w) => (
                <option key={w} value={w}>{TIME_WINDOW_LABELS[w]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Describe the problem</Label>
          <Textarea id="description" name="description" rows={3} placeholder="e.g. AC not cooling, making a loud noise..." />
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Sending...' : 'Request appointment'}
        </Button>
      </form>
    </>
  )
}
