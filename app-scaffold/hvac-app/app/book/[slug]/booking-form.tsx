'use client'

import { useState, useTransition } from 'react'
import { createBookingRequest } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const SERVICE_TYPES = [
  'AC repair',
  'Heating repair',
  'AC installation',
  'Heating installation',
  'Maintenance / tune-up',
  'Duct cleaning',
  'Indoor air quality',
  'Other',
]

const PREFERRED_WINDOWS = [
  'As soon as possible',
  'Weekday mornings',
  'Weekday afternoons',
  'Weekends',
  'Flexible',
]

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs'

export function BookingForm({ slug, orgName }: { slug: string; orgName: string }) {
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createBookingRequest(slug, formData)
      if (result.error) {
        setError(result.error)
      } else {
        setSubmitted(true)
      }
    })
  }

  if (submitted) {
    return (
      <div className="py-8 text-center">
        <h3 className="text-lg font-semibold mb-2">Thanks!</h3>
        <p className="text-sm text-muted-foreground">
          {orgName} will reach out to confirm your appointment.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="serviceType">Service needed *</Label>
        <select id="serviceType" name="serviceType" required className={SELECT_CLASS}>
          <option value="">Select a service</option>
          {SERVICE_TYPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="preferredWindow">Preferred time *</Label>
        <select id="preferredWindow" name="preferredWindow" required className={SELECT_CLASS}>
          <option value="">Select a time window</option>
          {PREFERRED_WINDOWS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactName">Your name *</Label>
        <Input id="contactName" name="contactName" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactPhone">Phone *</Label>
        <Input id="contactPhone" name="contactPhone" type="tel" required placeholder="(555) 555-5555" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactEmail">Email</Label>
        <Input id="contactEmail" name="contactEmail" type="email" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Service address</Label>
        <Input id="address" name="address" placeholder="123 Main St, City, ST 12345" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Describe the issue or any helpful details..."
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Submitting...' : 'Request appointment'}
      </Button>
    </form>
  )
}
