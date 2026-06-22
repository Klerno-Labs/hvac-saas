'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateInvoice } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { computeTaxCents, formatBpsAsPercent } from '@/lib/tax'

type LineItem = {
  name: string
  description: string
  quantity: number
  unitPriceCents: number
  taxable: boolean
  taxRateBps: number | null
}

type InitialData = {
  descriptionOfWork: string
  notes: string
  dueDate: string
  lineItems: LineItem[]
}

function newLineItem(): LineItem {
  return { name: '', description: '', quantity: 1, unitPriceCents: 0, taxable: true, taxRateBps: null }
}

export function InvoiceEditForm({
  invoiceId,
  initialData,
  defaultTaxRateBps,
  customerTaxExempt,
}: {
  invoiceId: string
  initialData: InitialData
  defaultTaxRateBps: number
  customerTaxExempt: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [descriptionOfWork, setDescriptionOfWork] = useState(initialData.descriptionOfWork)
  const [notes, setNotes] = useState(initialData.notes)
  const [dueDate, setDueDate] = useState(initialData.dueDate)
  const [lineItems, setLineItems] = useState<LineItem[]>(initialData.lineItems)

  const subtotalCents = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPriceCents, 0)
  const { taxCents } = computeTaxCents(
    lineItems.map((li) => ({ lineTotalCents: li.quantity * li.unitPriceCents, taxable: li.taxable, taxRateBps: li.taxRateBps })),
    defaultTaxRateBps,
    customerTaxExempt,
  )
  const totalCents = subtotalCents + taxCents

  function addLineItem() {
    setLineItems([...lineItems, newLineItem()])
  }

  function removeLineItem(index: number) {
    if (lineItems.length <= 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  function updateLineItem(index: number, field: keyof LineItem, value: string | number | boolean | null) {
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
        taxRateBps: li.taxRateBps,
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
                  <div className="flex items-center gap-4 mt-1">
                    <Label className="cursor-pointer flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={li.taxable}
                        onChange={(e) => updateLineItem(i, 'taxable', e.target.checked)}
                        className="size-4"
                      />
                      <span className="text-xs text-muted-foreground">Taxable</span>
                    </Label>
                    {li.taxable && (
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground">Tax rate %</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder={li.taxRateBps === null ? `default ${formatBpsAsPercent(defaultTaxRateBps)}` : ''}
                          value={li.taxRateBps === null ? '' : (li.taxRateBps / 100).toString()}
                          onChange={(e) => {
                            const v = e.target.value
                            updateLineItem(i, 'taxRateBps', v === '' ? null : Math.round(parseFloat(v) * 100))
                          }}
                          className="h-8 w-28"
                        />
                      </div>
                    )}
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">
              Tax{!customerTaxExempt && defaultTaxRateBps > 0 ? ` (${formatBpsAsPercent(defaultTaxRateBps)})` : ''}
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {customerTaxExempt ? 'Customer is tax-exempt' : formatCents(taxCents)}
            </p>
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
