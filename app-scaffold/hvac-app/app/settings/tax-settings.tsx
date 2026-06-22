'use client'

import { useState } from 'react'
import { updateTaxSettings } from './tax/actions'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatBpsAsPercent } from '@/lib/tax'

export function TaxSettingsSection({
  initialDefaultTaxRateBps,
}: {
  initialDefaultTaxRateBps: number
}) {
  const [defaultTaxRatePercent, setDefaultTaxRatePercent] = useState(
    (initialDefaultTaxRateBps / 100).toString(),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setError(null)
    setSaved(false)
    setLoading(true)

    const percent = parseFloat(defaultTaxRatePercent || '0')
    if (Number.isNaN(percent) || percent < 0) {
      setError('Enter a valid non-negative percentage')
      setLoading(false)
      return
    }

    const result = await updateTaxSettings({
      defaultTaxRateBps: Math.round(percent * 100),
    })

    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  const previewBps = Math.round((parseFloat(defaultTaxRatePercent || '0') || 0) * 100)

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Sales Tax</CardTitle>
        <CardDescription>
          Default sales-tax rate applied to taxable line items on new estimates and invoices.
          Set to 0 if your jurisdiction does not require sales tax. Per-line overrides and
          customer exemptions are handled on each document.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-destructive text-sm">{error}</div>
        )}
        {saved && (
          <div className="text-emerald-600 text-sm">Tax settings saved.</div>
        )}

        <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Default tax rate (%)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={defaultTaxRatePercent}
              onChange={(e) => setDefaultTaxRatePercent(e.target.value)}
              className="max-w-48"
            />
            <span className="text-[11px] text-muted-foreground">
              {previewBps === 0
                ? 'No tax applied by default'
                : `${formatBpsAsPercent(previewBps)} applied to taxable line items`}
            </span>
          </div>
        </div>

        <Button onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save settings'}
        </Button>
      </CardContent>
    </Card>
  )
}
