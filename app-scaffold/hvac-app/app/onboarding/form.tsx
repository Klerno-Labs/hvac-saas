'use client'

import { useState } from 'react'
import { createOrganization } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TRADE_IDS, TRADE_PROFILES, type TradeId } from '@/lib/trades'

export function OnboardingForm({ initialTradeType = 'hvac' }: { initialTradeType?: TradeId }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    try {
      const result = await createOrganization(formData)
      if (result.success) {
        window.location.assign('/dashboard')
      } else {
        setError(result.error)
        setLoading(false)
      }
    } catch {
      setError('We could not finish setting up your business. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <div role="alert" className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        <div className="space-y-2">
          <Label htmlFor="name">Business name *</Label>
          <Input id="name" name="name" type="text" required maxLength={200} autoComplete="organization" placeholder="e.g. Smith Service Company" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tradeType">Business trade</Label>
          <select id="tradeType" name="tradeType" defaultValue={initialTradeType} aria-describedby="trade-help" className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {TRADE_IDS.map((id) => <option key={id} value={id}>{TRADE_PROFILES[id].name}</option>)}
          </select>
          <p id="trade-help" className="text-xs text-muted-foreground">Personalizes service examples and estimate drafts. You can change this in Settings.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Business phone</Label>
          <Input id="phone" name="phone" type="tel" placeholder="(555) 555-5555" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Business email</Label>
          <Input id="email" name="email" type="email" placeholder="office@example.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <select name="timezone" id="timezone" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors">
            <option value="">Select timezone</option>
            <option value="America/New_York">Eastern</option>
            <option value="America/Chicago">Central</option>
            <option value="America/Denver">Mountain</option>
            <option value="America/Los_Angeles">Pacific</option>
            <option value="America/Anchorage">Alaska</option>
            <option value="Pacific/Honolulu">Hawaii</option>
          </select>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating...' : 'Create business'}
        </Button>
      </form>
    </>
  )
}
