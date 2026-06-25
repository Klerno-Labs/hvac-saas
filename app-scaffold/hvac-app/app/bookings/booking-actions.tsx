'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmBookingRequest, declineBookingRequest, enableBooking, disableBooking } from './actions'
import { Button } from '@/components/ui/button'

export function BookingActions({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)

  function handleDecline() {
    startTransition(async () => {
      await declineBookingRequest(requestId)
      router.refresh()
    })
  }

  function handleConfirm(formData: FormData) {
    startTransition(async () => {
      await confirmBookingRequest(requestId, formData)
      router.refresh()
    })
  }

  if (showConfirm) {
    return (
      <form action={handleConfirm} className="flex items-center gap-1">
        <select
          name="leadSource"
          defaultValue="web"
          className="text-xs border rounded px-1 py-1 bg-background"
        >
          <option value="web">Web</option>
          <option value="referral">Referral</option>
          <option value="google">Google</option>
          <option value="other">Other</option>
        </select>
        <Button type="submit" disabled={isPending} size="xs" className="bg-emerald-600 hover:bg-emerald-700">
          Confirm
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="text-muted-foreground"
          onClick={() => setShowConfirm(false)}
        >
          Cancel
        </Button>
      </form>
    )
  }

  return (
    <div className="flex gap-1">
      <Button
        onClick={() => setShowConfirm(true)}
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
        className="text-muted-foreground"
      >
        Decline
      </Button>
    </div>
  )
}

export function BookingToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handle() {
    startTransition(async () => {
      if (enabled) {
        await disableBooking()
      } else {
        await enableBooking()
      }
      router.refresh()
    })
  }

  return (
    <Button
      onClick={handle}
      disabled={isPending}
      size="sm"
      variant={enabled ? 'outline' : 'default'}
    >
      {enabled ? 'Disable' : 'Enable booking page'}
    </Button>
  )
}
