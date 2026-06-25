'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateInvoice } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type LineItem = {
  name: string
  description: string
  quantity: number
  unitPriceCents: number
  taxable: boolean
  taxRateBps: number
}

type InitialData = {
  descriptionOfWork: string
  notes: string
  defaultTaxRateBps: number
  customerTaxExempt: boolean
  dueDate: string
  lineItems: LineItem[]
}

export function InvoiceEditForm({ invoiceId, initialData }: { invoiceId: string; initialData: InitialData }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [descriptionOfWork, setDescriptionOfWork] = useState(initialData.descriptionOfWork)
  const [notes, setNotes] = useState(initialData.notes)
  const initRate = initialData.lineItems.find((li) => li.taxRateBps > 0)?.taxRateBps ?? initialData.defaultTaxRateBps
  const [taxRateBps, setTaxRateBps] = useState(initRate)
  const [dueDate, setDueDate] = useState(initialData.dueDate)
  const [lineItems, setLineItems] = useState<LineItem[]>(initialData.lineItems)

  const customerTaxExempt = initialData.customerTaxExempt
  const subtotalCents = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPriceCents, 0)
  const taxCents = lineItems.reduce(
    (sum, li) => sum + (li.taxable && !customerTaxExempt ? Math.round(li.quantity * li.unitPriceCents * taxRateBps / 10000) : 0),
    0,
  )
  const totalCents = subtotalCents + taxCents

  function addLineItem() {
    setLineItems([...lineItems, { name: '', description: '', quantity: 1, unitPriceCents: 0, taxable: true, taxRateBps }])
  }

  function removeLineItem(index: number) {
    if (lineItems.length <= 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  function updateLineItem(index: number, field: keyof LineItem, value: string | number | boolean) {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await updateInvoice(invoiceId, {
      descriptionOfWork,
      notes: notes || undefined,
      dueDate: dueDate || undefined,
      lineItems: lineItems.map((li) => ({
        name: li.name,
        description: li.description || undefined,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        taxable: li.taxable,
        taxRateBps,
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
        <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <Label>Description of work *</Label>
          <Textarea
            value={descriptionOfWork}
            onChange={(e) => setDescriptionOfWork(e.target.value)}
            required
            rows={4}
            className="resize-y"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <Label>Line items *</Label>
            <button type="button" onClick={addLineItem} className="text-xs text-primary bg-transparent border-none cursor-pointer">
              + Add item
            </button>
          </div>

          {lineItems.map((li, i) => (
            <div key={i} className="border border-input rounded-lg p-3 mb-2">
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
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        value={li.quantity}
                        onChange={(e) => updateLineItem(i, 'quantity', parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Unit price ($)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={(li.unitPriceCents / 100).toFixed(2)}
                        onChange={(e) => updateLineItem(i, 'unitPriceCents', Math.round(parseFloat(e.target.value || '0') * 100))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Line total</Label>
                      <Input
                        type="text"
                        readOnly
                        value={formatCents(li.quantity * li.unitPriceCents)}
                        className="bg-muted"
                      />
                    </div>
                  </div>
                  {!customerTaxExempt && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={li.taxable}
                        onChange={(e) => updateLineItem(i, 'taxable', e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      Taxable
                    </label>
                  )}
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Tax rate (%)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={(taxRateBps / 100).toFixed(2)}
              onChange={(e) => setTaxRateBps(Math.round(parseFloat(e.target.value || '0') * 100))}
              disabled={customerTaxExempt}
            />
            {customerTaxExempt && (
              <p className="text-xs text-muted-foreground">Customer is tax-exempt</p>
            )}
          </div>
          <div>
            <Label>Tax</Label>
            <p className="text-base font-medium mt-1">{formatCents(taxCents)}</p>
          </div>
          <div>
            <Label>Total</Label>
            <p className="text-xl font-bold mt-1">{formatCents(totalCents)}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Due date</Label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="resize-y"
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
