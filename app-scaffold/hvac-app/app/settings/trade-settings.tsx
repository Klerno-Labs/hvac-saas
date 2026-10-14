'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TRADE_IDS, TRADE_PROFILES, getTradeProfile, isTradeId } from '@/lib/trades'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { updateOrganizationTrade } from './trade/actions'

export function TradeSettingsSection({ initialTradeType, canEdit }: { initialTradeType: string; canEdit: boolean }) {
  const router = useRouter()
  const [tradeType, setTradeType] = useState(isTradeId(initialTradeType) ? initialTradeType : '')
  const [savedTradeType, setSavedTradeType] = useState(initialTradeType)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const profile = getTradeProfile(tradeType || initialTradeType)

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      const result = await updateOrganizationTrade({ tradeType })
      if (!result.success) {
        setError(result.error)
        return
      }
      setSavedTradeType(tradeType)
      setSaved(true)
      router.refresh()
    } catch {
      setError('Your trade could not be saved. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Business trade</CardTitle>
        <CardDescription>Personalize service examples and new estimate drafts for your team.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2 max-w-xl">
            <Label htmlFor="business-trade">Primary trade</Label>
            <select id="business-trade" value={tradeType} onChange={(event) => { setTradeType(event.target.value); setSaved(false); setError(null) }} disabled={!canEdit || pending} required aria-describedby="business-trade-description" className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              {!isTradeId(initialTradeType) && <option value="" disabled>Choose a trade for your business</option>}
              {TRADE_IDS.map((id) => <option key={id} value={id}>{TRADE_PROFILES[id].name}</option>)}
            </select>
            <p id="business-trade-description" className="text-sm text-muted-foreground">{profile.description}</p>
          </div>
          <p className="text-xs text-muted-foreground">Changing your trade preserves your customers, jobs, estimates, and invoices. Existing documents keep their original content.</p>
          {canEdit ? <Button type="submit" disabled={pending || !tradeType || tradeType === savedTradeType}>{pending ? 'Saving…' : 'Save trade'}</Button> : <p className="text-sm text-muted-foreground">Your business owner can change this setting.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {saved && <p role="status" className="text-sm text-muted-foreground">Business trade saved.</p>}
        </form>
      </CardContent>
    </Card>
  )
}
