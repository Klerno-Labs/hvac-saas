'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateEstimate } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PriceBookPicker } from '../_components/pricebook-picker'
import { type PriceBookItem } from '@/lib/pricebook-to-lineitem'

type LineItem = {
  name: string
  description: string
  quantity: number
  unitPriceCents: number
}

type InitialData = {
  scopeOfWork: string
  terms: string
  notes: string
  taxCents: number
  lineItems: LineItem[]
}

export function EstimateEditForm({
  estimateId,
  initialData,
  priceBookItems,
}: {
  estimateId: string
  initialData: InitialData
  priceBookItems: PriceBookItem[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [scopeOfWork, setScopeOfWork] = useState(initialData.scopeOfWork)
  const [terms, setTerms] = useState(initialData.terms)
  const [notes, setNotes] = useState(initialData.notes)
  const [taxCents, setTaxCents] = useState(initialData.taxCents)
  const [lineItems, setLineItems] = useState<LineItem[]>(initialData.lineItems)

  const subtotalCents = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPriceCents, 0)
  const totalCents = subtotalCents + taxCents

  function addLineItem() {
    setLineItems([...lineItems, { name: '', description: '', quantity: 1, unitPriceCents: 0 }])
  }

  function removeLineItem(index: number) {
    if (lineItems.length <= 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await updateEstimate(estimateId, {
      scopeOfWork,
      terms: terms || undefined,
      notes: notes || undefined,
      taxCents,
      lineItems: lineItems.map((li) => ({
        name: li.name,
        description: li.description || undefined,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
      })),
    })

    if (result.success) {
      router.refresh()
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  return (
    <>
      {error && (
        <div className="text-destructive text-sm mb-3">{error}</div>
      )}
      <PriceBookPicker
        items={priceBookItems}
        onPick={(li) => setLineItems([...lineItems, li])}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <Label className="text-sm font-medium">Scope of work *</Label>
          <Textarea
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
            required
            rows={4}
            className="mt-1 resize-y"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <Label className="text-sm font-medium">Line items *</Label>
            <button type="button" onClick={addLineItem} className="text-xs text-primary bg-transparent border-none cursor-pointer">
              + Add item
            </button>
          </div>

          {lineItems.map((li, i) => (
            <div key={i} className="border rounded-lg p-3 mb-2">
              <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="Item name"
                    value={li.name}
                    onChange={(e) => updateLineItem(i, 'name', e.target.value)}
                    required
                  />
                  <Input
                    placeholder="Description (optional)"
                    value={li.description}
                    onChange={(e) => updateLineItem(i, 'description', e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        value={li.quantity}
                        onChange={(e) => updateLineItem(i, 'quantity', parseInt(e.target.value) || 1)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Unit price ($)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={(li.unitPriceCents / 100).toFixed(2)}
                        onChange={(e) => updateLineItem(i, 'unitPriceCents', Math.round(parseFloat(e.target.value || '0') * 100))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Line total</Label>
                      <Input
                        type="text"
                        readOnly
                        value={formatCents(li.quantity * li.unitPriceCents)}
                        className="mt-1 bg-muted"
                      />
                    </div>
                  </div>
                </div>
                {lineItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLineItem(i)}
                    className="bg-transparent border-none text-destructive cursor-pointer text-lg px-1"
                    title="Remove item"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">Tax ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={(taxCents / 100).toFixed(2)}
              onChange={(e) => setTaxCents(Math.round(parseFloat(e.target.value || '0') * 100))}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Total</Label>
            <p className="text-xl font-bold mt-1">{formatCents(totalCents)}</p>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Terms</Label>
          <Textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={2}
            className="mt-1 resize-y"
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 resize-y"
          />
        </div>

        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? 'Saving...' : 'Save changes'}
        </Button>
      </form>
    </>
  )
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}
