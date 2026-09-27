'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { saveBusinessProfile } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TRADE_IDS, TRADE_PROFILES, isTradeId } from '@/lib/trades'

type BusinessDetails = { name: string; tradeType: string; timezone: string | null; phone: string | null; email: string | null }

export function BusinessProfileForm({ initial, timezones, writable }: { initial: BusinessDetails; timezones: string[]; writable: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true); setError(null); setSaved(false)
    try {
      const result = await saveBusinessProfile(Object.fromEntries(form.entries()))
      if (!result.success) { setError(result.error); return }
      setSaved(true)
      router.refresh()
    } catch { setError('Your business details could not be saved. Please try again.') }
    finally { setPending(false) }
  }
  const inputClass = 'flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <form onSubmit={submit} className="space-y-6">
      {!writable && <div className="rounded-lg border p-4 text-sm">Your workspace is read-only. <Link href="/settings/billing" className="font-semibold underline">Review your app subscription</Link> before changing these details.</div>}
      <fieldset disabled={!writable || pending} className="space-y-5 disabled:opacity-60">
        <div className="space-y-2"><Label htmlFor="business-name">Business name</Label><Input id="business-name" name="name" defaultValue={initial.name} maxLength={200} autoComplete="organization" required /></div>
        <div className="space-y-2"><Label htmlFor="business-trade">Primary trade</Label><select id="business-trade" name="tradeType" defaultValue={isTradeId(initial.tradeType) ? initial.tradeType : ''} required className={inputClass}><option value="" disabled>Choose your trade</option>{TRADE_IDS.map(id => <option key={id} value={id}>{TRADE_PROFILES[id].name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="business-timezone">Business timezone</Label><select id="business-timezone" name="timezone" defaultValue={initial.timezone && timezones.includes(initial.timezone) ? initial.timezone : ''} required className={inputClass}><option value="" disabled>Choose your business timezone</option>{timezones.map(zone => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}</select><p className="text-sm text-muted-foreground">Used for your business day, due dates, and appointment reminders. Existing scheduled calendar dates stay the same.</p></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="business-email">Business email <span className="text-muted-foreground">(optional)</span></Label><Input id="business-email" name="email" type="email" maxLength={254} autoComplete="email" defaultValue={initial.email ?? ''} /></div>
          <div className="space-y-2"><Label htmlFor="business-phone">Business phone <span className="text-muted-foreground">(optional)</span></Label><Input id="business-phone" name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={initial.phone ?? ''} /></div>
        </div>
        <p className="text-sm text-muted-foreground">These details update your business profile. Changing your trade does not rewrite existing job or estimate content.</p>
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save business details'}</Button>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="text-sm">Business details saved. <Link href="/setup" className="font-semibold underline">Continue setup</Link></p>}
    </form>
  )
}
