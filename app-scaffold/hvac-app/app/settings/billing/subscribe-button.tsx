'use client'

import { useState } from 'react'
import { subscribe } from './actions'
import { Button } from '@/components/ui/button'
import { supportEmail } from '@/lib/support'

export function SubscribeButton({ planId, userEmail }: { planId: string; userEmail: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubscribe() {
    setLoading(true)
    setError(null)

    let result
    try { result = await subscribe(planId, userEmail) } catch {
      setError(`Billing is temporarily unavailable. Please try again or contact ${supportEmail}.`); setLoading(false); return
    }

    if ('url' in result) {
      window.location.href = result.url
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div>
      {error && <p role="alert" className="text-xs text-destructive mb-2">{error}</p>}
      <Button className="w-full" disabled={loading} onClick={handleSubscribe}>
        {loading ? 'Redirecting...' : 'Subscribe'}
      </Button>
    </div>
  )
}

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function manage() {
    setLoading(true); setError(null)
    try {
      const response = await fetch('/api/billing/portal', {method: 'POST'})
      if (!response.ok) throw new Error(`Billing is temporarily unavailable. Please try again or contact ${supportEmail}.`)
      const result = await response.json()
      if (typeof result.url !== 'string' || !result.url.startsWith('https://billing.stripe.com/')) throw new Error(`Unable to open billing. Please try again or contact ${supportEmail}.`)
      window.location.assign(result.url)
    } catch (error) {
      setError(error instanceof Error ? error.message : `Unable to open billing. Contact ${supportEmail} for help.`); setLoading(false)
    }
  }
  return <div className="mt-4"><Button onClick={manage} disabled={loading}>{loading ? 'Opening billing…' : 'Manage billing'}</Button>{error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}</div>
}
