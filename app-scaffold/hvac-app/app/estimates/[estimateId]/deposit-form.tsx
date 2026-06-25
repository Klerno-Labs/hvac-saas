'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setEstimateDeposit } from './actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

export function DepositForm({
  estimateId,
  currentRequired,
  currentType,
  currentPercent,
  currentAmountCents,
}: {
  estimateId: string
  currentRequired: boolean
  currentType: string | null
  currentPercent: number | null
  currentAmountCents: number | null
}) {
  const router = useRouter()
  const [required, setRequired] = useState(currentRequired)
  const [type, setType] = useState<'percent' | 'fixed'>(currentType === 'fixed' ? 'fixed' : 'percent')
  const [percent, setPercent] = useState(currentPercent != null ? String(currentPercent) : '')
  const [amountDollars, setAmountDollars] = useState(
    currentAmountCents != null && currentType === 'fixed' ? String(currentAmountCents / 100) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const input = required
      ? type === 'percent'
        ? { required: true as const, type: 'percent' as const, percent: Number(percent) }
        : { required: true as const, type: 'fixed' as const, amountCents: Math.round(Number(amountDollars) * 100) }
      : { required: false as const }

    const result = await setEstimateDeposit(estimateId, input)

    if (result.success) {
      router.refresh()
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  return (
    <>
      {error && <div className="text-destructive text-sm mb-3">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-3 mt-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="depositRequired"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="depositRequired">Require deposit</Label>
        </div>

        {required && (
          <>
            <div>
              <Label>Type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'percent' | 'fixed')}
                className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>

            {type === 'percent' ? (
              <div>
                <Label htmlFor="depositPercent">Percent (0–100)</Label>
                <Input
                  id="depositPercent"
                  type="number"
                  min={0}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="mt-1"
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="depositAmount">Amount ($)</Label>
                <Input
                  id="depositAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amountDollars}
                  onChange={(e) => setAmountDollars(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
          </>
        )}

        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save deposit settings'}
        </Button>
      </form>
    </>
  )
}
