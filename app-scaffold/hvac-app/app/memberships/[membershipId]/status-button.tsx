'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function MembershipStatusButton({
  membershipId,
  status,
}: {
  membershipId: string
  status: string
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
      {status === 'active' && (
        <Button variant="secondary" disabled={loading} onClick={() => handleAction('pause')}>
          {loading ? 'Updating...' : 'Pause'}
        </Button>
      )}
      {status === 'paused' && (
        <Button variant="default" disabled={loading} onClick={() => handleAction('activate')}>
          {loading ? 'Updating...' : 'Activate'}
        </Button>
      )}
      {status !== 'cancelled' && (
        <Button variant="destructive" disabled={loading} onClick={() => handleAction('cancel')}>
          {loading ? 'Updating...' : 'Cancel'}
        </Button>
      )}
    </div>
  )
}
