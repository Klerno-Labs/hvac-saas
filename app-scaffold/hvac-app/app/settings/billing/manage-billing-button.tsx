'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export type PortalResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Calls the server-side billing portal route and returns the hosted Stripe url.
 * Only the `{ url }` (or an error string) ever reaches the client — no secrets.
 */
export async function requestBillingPortal(
  fetchImpl: typeof fetch = fetch,
): Promise<PortalResult> {
  try {
    const res = await fetchImpl('/api/billing/portal', { method: 'POST' })
    const data = (await res.json()) as { url?: string; error?: string }
    if (res.ok && typeof data.url === 'string') {
      return { ok: true, url: data.url }
    }
    return { ok: false, error: data.error || 'Could not open billing portal.' }
  } catch {
    return { ok: false, error: 'Network error. Please try again.' }
  }
}

export function ManageBillingButton() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setPending(true)
    setError(null)
    const result = await requestBillingPortal()
    if (result.ok) {
      window.location.assign(result.url)
      return
    }
    setError(result.error)
    setPending(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={handleClick} disabled={pending}>
        {pending ? 'Opening portal…' : 'Manage billing'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
