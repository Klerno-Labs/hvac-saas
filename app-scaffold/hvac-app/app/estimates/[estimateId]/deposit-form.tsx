'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setEstimateDeposit } from './actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

export function DepositForm({
  estimateId,
  totalCents,
  depositRequired: initialRequired,
  depositAmountCents: initialAmountCents,
}: {
  estimateId: string
  totalCents: number
  depositRequired: boolean
  depositAmountCents: number
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [required, setRequired] = useState(initialRequired)
  const [type, setType] = useState<'percent' | 'fixed'>(
    initialRequired && initialAmountCents > 0 ? 'fixed' : 'percent',
  )
  const [value, setValue] = useState(
    initialRequired && initialAmountCents > 0
      ? (initialAmountCents / 100).toFixed(2)
      : '',
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    let depositAmountCents = 0
    if (required) {
      const num = parseFloat(value)
      if (isNaN(num) || num <= 0) {
        setError('Enter a valid deposit amount')
        setLoading(false)
        return
      }
      if (type === 'percent') {
        if (num > 100) {
          setError('Percent must be between 1 and 100')
          setLoading(false)
          return
        }
        depositAmountCents = Math.round(totalCents * (num / 100))
      } else {
        depositAmountCents = Math.round(num * 100)
      }
    }

    const result = await setEstimateDeposit(estimateId, { depositRequired: required, depositAmountCents })
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
            id="depositRequired"
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="depositRequired">Require deposit</Label>
        </div>

        {required && (
          <div className="flex gap-3 items-end">
            <div>
              <Label className="text-sm font-medium">Type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'percent' | 'fixed')}
                className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed amount ($)</option>
              </select>
            </div>
            <div className="flex-1">
              <Label className="text-sm font-medium">
                {type === 'percent' ? 'Percent (0–100)' : 'Amount (dollars)'}
              </Label>
              <Input
                type="number"
                min={0}
                max={type === 'percent' ? 100 : undefined}
                step={type === 'percent' ? 1 : 0.01}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1"
                placeholder={type === 'percent' ? '10' : '500.00'}
              />
            </div>
          </div>
        )}

        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save deposit settings'}
        </Button>
      </form>
    </>
  )
}
