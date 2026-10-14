'use client'

import { useState } from 'react'
import { acceptInvite } from './actions'
import { Button } from '@/components/ui/button'

export function AcceptInviteButton({ token }: { token: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    setLoading(true)
    setError(null)
    try {
      const result = await acceptInvite(token)
      if (result.success) { window.location.assign('/dashboard') }
      else setError(result.error)
    } catch { setError('The connection was interrupted. Refresh to check your invitation and try again.') }
    finally { setLoading(false) }
  }

  return (
    <div>
      {error && <div role="alert" className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>}
      <Button onClick={handleAccept} disabled={loading} className="w-full">
        {loading ? 'Joining...' : 'Accept invitation'}
      </Button>
    </div>
  )
}
