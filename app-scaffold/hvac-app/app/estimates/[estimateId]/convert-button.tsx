'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createInvoiceFromEstimate } from './convert-action'

export function ConvertEstimateButton({ estimateId }: { estimateId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function convert() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const result = await createInvoiceFromEstimate(estimateId)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/invoices/${result.invoiceId}`)
      router.refresh()
    } catch {
      setError('The connection was interrupted. Try again to create or open this estimate’s invoice.')
    } finally {
      setPending(false)
    }
  }

  return <div>
    <Button type="button" onClick={convert} disabled={pending} aria-busy={pending} aria-describedby={error ? 'conversion-error' : undefined}>
      {pending ? 'Creating draft…' : 'Create draft invoice'}
    </Button>
    {error && <p id="conversion-error" role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </div>
}
