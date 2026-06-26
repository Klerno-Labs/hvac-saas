'use client'

import { useState } from 'react'
import { createBookingRequest } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SERVICE_TYPES, PREFERRED_WINDOWS } from '@/lib/validations/booking'

export function BookingForm({ slug, orgName }: { slug: string; orgName: string }) {
  const [serviceType, setServiceType] = useState('')
  const [preferredWindow, setPreferredWindow] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    if (!serviceType) {
      setError('Please select a service type.')
      return
    }
    if (!preferredWindow) {
      setError('Please select a preferred time window.')
      return
    }
    formData.set('serviceType', serviceType)
    formData.set('preferredWindow', preferredWindow)
    setError(null)
    setLoading(true)

    const result = await createBookingRequest(slug, formData)

    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      setSubmitted(true)
    }
  }

  if (submitted) {
    return (
      <div className="py-8 text-center">
        <h3 className="text-lg font-semibold mb-2">Request received!</h3>
        <p className="text-sm text-muted-foreground">
          Thanks — {orgName} will reach out to confirm your appointment.
        </p>
      </div>
    )
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <Label className="mb-2 block">Service type</Label>
        <Select value={serviceType} onValueChange={setServiceType}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a service..." />
          </SelectTrigger>
          <SelectContent>
            {SERVICE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-2 block">Preferred time window</Label>
        <Select value={preferredWindow} onValueChange={setPreferredWindow}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a window..." />
          </SelectTrigger>
          <SelectContent>
            {PREFERRED_WINDOWS.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="contactName" className="mb-2 block">
          Your name
        </Label>
        <Input id="contactName" name="contactName" required placeholder="Jane Smith" />
      </div>

      <div>
        <Label htmlFor="contactPhone" className="mb-2 block">
          Phone number
        </Label>
        <Input
          id="contactPhone"
          name="contactPhone"
          type="tel"
          required
          placeholder="(555) 000-0000"
        />
      </div>

      <div>
        <Label htmlFor="contactEmail" className="mb-2 block">
          Email (optional)
        </Label>
        <Input
          id="contactEmail"
          name="contactEmail"
          type="email"
          placeholder="jane@example.com"
        />
      </div>

      <div>
        <Label htmlFor="address" className="mb-2 block">
          Service address (optional)
        </Label>
        <Input id="address" name="address" placeholder="123 Main St, City, State" />
      </div>

      <div>
        <Label htmlFor="notes" className="mb-2 block">
          Notes (optional)
        </Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder="Describe the issue or any helpful details..."
          rows={3}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Submitting...' : 'Request Appointment'}
      </Button>
    </form>
  )
}
