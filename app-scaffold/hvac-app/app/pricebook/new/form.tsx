'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPriceBookItem } from '../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

export default function PriceBookForm() {
  const router = useRouter()
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="space-y-5" onSubmit={async event => {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    let saved = false
    try {
      const result = await createPriceBookItem(new FormData(event.currentTarget))
      if (result.success) { saved = true; router.push('/pricebook'); router.refresh() }
      else setError(result.error)
    } catch { setError('Connection interrupted. Check your price book before trying again.') }
    finally { if (!saved) { lock.current = false; setBusy(false) } }
  }}>
    <div><Label htmlFor="item-name">Service or item name</Label><Input id="item-name" name="name" required maxLength={200} placeholder="Seasonal system inspection" /></div>
    <div><Label htmlFor="item-category">Category (optional)</Label><Input id="item-category" name="category" maxLength={100} placeholder="Maintenance" /></div>
    <div><Label htmlFor="item-description">Description (optional)</Label><Textarea id="item-description" name="description" maxLength={2000} placeholder="Describe the scope included in this price." /></div>
    <div className="grid sm:grid-cols-2 gap-4"><div><Label htmlFor="item-price">Customer price (USD)</Label><Input id="item-price" name="flatPrice" type="number" min="0" max="21474836.47" step="0.01" required inputMode="decimal" /></div><div><Label htmlFor="item-cost">Your cost (USD, optional)</Label><Input id="item-cost" name="cost" type="number" min="0" max="21474836.47" step="0.01" inputMode="decimal" /></div></div>
    <p className="text-sm text-muted-foreground">Review your prices before sending an estimate. Your internal cost is kept separate from the customer price.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}<Button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save item'}</Button>
  </form>
}
