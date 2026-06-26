'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmBookingRequest, declineBookingRequest } from './actions'
import { Button } from '@/components/ui/button'

const LEAD_SOURCES = [
  { value: 'web', label: 'Web' },
  { value: 'referral', label: 'Referral' },
  { value: 'google', label: 'Google' },
  { value: 'yelp', label: 'Yelp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'other', label: 'Other' },
]

export function BookingActions({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [leadSource, setLeadSource] = useState('web')

  function handleConfirm() {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('leadSource', leadSource)
      await confirmBookingRequest(bookingId, formData)
      router.refresh()
    })
  }

  function handleDecline() {
    startTransition(async () => {
      await declineBookingRequest(bookingId)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={leadSource}
        onChange={(e) => setLeadSource(e.target.value)}
        disabled={isPending}
        className="text-xs border rounded px-2 py-1 bg-background"
      >
        {LEAD_SOURCES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <Button
        onClick={handleConfirm}
        disabled={isPending}
        size="xs"
        className="bg-emerald-600 hover:bg-emerald-700"
      >
        Confirm
      </Button>
      <Button
        onClick={handleDecline}
        disabled={isPending}
        size="xs"
        variant="outline"
      >
        Decline
      </Button>
    </div>
  )
}
