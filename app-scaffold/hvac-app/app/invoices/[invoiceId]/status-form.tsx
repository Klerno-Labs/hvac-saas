'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateInvoiceStatus } from './actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'void', label: 'Void' },
]

export function InvoiceStatusForm({ invoiceId, currentStatus }: { invoiceId: string; currentStatus: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setWarning(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    try {
      const result = await updateInvoiceStatus(invoiceId, formData)
      if (result.success) {
        setWarning(result.warning ?? null)
        router.refresh()
      } else setError(result.error)
    } catch {
      setError('The connection was interrupted. Refresh to check the current status before trying again.')
    } finally { setLoading(false) }
  }

  if (currentStatus === 'paid' || currentStatus === 'void') return <p className="text-sm text-muted-foreground">This invoice is {currentStatus} and cannot be changed.</p>

  return (
    <>
      {warning && <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{warning}</p>}
      {error && (
        <div role="alert" className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-3 items-end mt-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="invoice-status">Status</Label>
          <select
            id="invoice-status"
            name="status"
            defaultValue={currentStatus}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {STATUSES.filter(s => s.value === currentStatus || (currentStatus === 'draft' ? ['sent', 'void'] : ['sent', 'overdue', 'void']).includes(s.value)).map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? 'Updating...' : 'Update'}
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Choosing Sent sends or retries the customer email.</p>
    </>
  )
}
