'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function ManageBillingButton() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Failed to open billing portal')
        setPending(false)
        return
      }
      window.location.assign(data.url)
    } catch {
      setError('Something went wrong. Please try again.')
      setPending(false)
    }
  }

  return (
    <div>
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      <Button onClick={handleClick} disabled={pending} variant="outline">
        {pending ? 'Opening...' : 'Manage Billing'}
      </Button>
    </div>
  )
}
