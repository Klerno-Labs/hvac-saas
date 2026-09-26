'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createInvoice } from './actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type LineItem = {
  name: string
  description: string
  quantity: number
  unitPriceCents: number
}

type InitialData = {
  descriptionOfWork: string
  notes: string
  taxCents: number
  dueDate: string
  lineItems: LineItem[]
}

export function InvoiceForm({ jobId, initialData }: { jobId: string; initialData: InitialData }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [descriptionOfWork, setDescriptionOfWork] = useState(initialData.descriptionOfWork)
  const [notes, setNotes] = useState(initialData.notes)
  const [taxCents, setTaxCents] = useState(initialData.taxCents)
  const [dueDate, setDueDate] = useState(initialData.dueDate)
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

    const result = await createInvoice({
      jobId,
      descriptionOfWork,
      notes: notes || undefined,
      taxCents,
      dueDate: dueDate || undefined,
      lineItems: lineItems.map((li) => ({
        name: li.name,
        description: li.description || undefined,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
      })),
    })

    if (result.success) {
      router.push(`/invoices/${result.invoiceId}`)
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
        <div className="space-y-1.5">
          <Label>Description of work *</Label>
          <Textarea
            aria-label="Description of work"
            value={descriptionOfWork}
            onChange={(e) => setDescriptionOfWork(e.target.value)}
            required
            rows={4}
            className="resize-y"
          />
        </div>

        <div className="mt-2">
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
                    aria-label={`Item name, line ${i + 1}`}
                    value={li.name}
                    onChange={(e) => updateLineItem(i, 'name', e.target.value)}
                    required
                  />
                  <Input
                    placeholder="Description (optional)"
                    aria-label={`Item description, line ${i + 1}`}
                    value={li.description}
                    onChange={(e) => updateLineItem(i, 'description', e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        aria-label={`Quantity, line ${i + 1}`}
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
                        aria-label={`Unit price in dollars, line ${i + 1}`}
                        value={(li.unitPriceCents / 100).toFixed(2)}
                        onChange={(e) => updateLineItem(i, 'unitPriceCents', Math.round(parseFloat(e.target.value || '0') * 100))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Line total</Label>
                      <Input
                        type="text"
                        readOnly
                        aria-label={`Line total, line ${i + 1}`}
                        value={formatCents(li.quantity * li.unitPriceCents)}
                        className="bg-muted"
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
                    aria-label={`Remove line ${i + 1}`}
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tax ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              aria-label="Tax in dollars"
              value={(taxCents / 100).toFixed(2)}
              onChange={(e) => setTaxCents(Math.round(parseFloat(e.target.value || '0') * 100))}
            />
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
            aria-label="Due date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            aria-label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Additional notes for the customer"
            className="resize-y"
          />
        </div>

        <div className="flex gap-3 mt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Create invoice'}
          </Button>
          <Link href={`/jobs/${jobId}` as never} className={buttonVariants({ variant: 'ghost' })}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  )
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}
