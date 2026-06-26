'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function MembershipActionButtons({
  membershipId,
  isActive,
  isPaused,
}: {
  membershipId: string
  isActive: boolean
  isPaused: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleAction(action: 'pause' | 'cancel' | 'activate') {
    setLoading(true)
    await fetch(`/api/memberships/${membershipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="flex gap-2">
      {isActive && (
        <Button variant="secondary" onClick={() => handleAction('pause')} disabled={loading}>
          {loading ? 'Updating...' : 'Pause'}
        </Button>
      )}
      {isPaused && (
        <Button variant="default" onClick={() => handleAction('activate')} disabled={loading}>
          {loading ? 'Updating...' : 'Activate'}
        </Button>
      )}
      {(isActive || isPaused) && (
        <Button variant="outline" onClick={() => handleAction('cancel')} disabled={loading}>
          Cancel
        </Button>
      )}
    </div>
  )
}
