'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createEstimate, generateAiDraft } from './actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type LineItem = {
  name: string
  description: string
  quantity: number
  unitPriceCents: number
  taxable: boolean
}

export function EstimateForm({
  jobId,
  jobTitle,
  defaultTaxRateBps = 0,
  customerTaxExempt = false,
}: {
  jobId: string
  jobTitle: string
  defaultTaxRateBps?: number
  customerTaxExempt?: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiUsed, setAiUsed] = useState(false)

  const [scopeOfWork, setScopeOfWork] = useState('')
  const [terms, setTerms] = useState('')
  const [notes, setNotes] = useState('')
  const [taxRateBps, setTaxRateBps] = useState(defaultTaxRateBps)
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { name: '', description: '', quantity: 1, unitPriceCents: 0, taxable: true },
  ])

  const subtotalCents = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPriceCents, 0)
  const effectiveRate = customerTaxExempt ? 0 : taxRateBps
  const taxCents = lineItems.reduce(
    (sum, li) => sum + (li.taxable && !customerTaxExempt ? Math.round(li.quantity * li.unitPriceCents * effectiveRate / 10000) : 0),
    0,
  )
  const totalCents = subtotalCents + taxCents

  async function handleAiDraft() {
    setAiLoading(true)
    setError(null)

    const result = await generateAiDraft(jobId)

    if (result.success) {
      setScopeOfWork(result.draft.scopeOfWork)
      setNotes(result.draft.notes)
      setLineItems(result.draft.lineItems.map((li) => ({
        name: li.name,
        description: li.description,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        taxable: true,
      })))
      setAiUsed(true)
    } else {
      setError(result.error)
    }

    setAiLoading(false)
  }

  function addLineItem() {
    setLineItems([...lineItems, { name: '', description: '', quantity: 1, unitPriceCents: 0, taxable: true }])
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

    const result = await createEstimate({
      jobId,
      scopeOfWork,
      terms: terms || undefined,
      notes: notes || undefined,
      lineItems: lineItems.map((li) => ({
        name: li.name,
        description: li.description || undefined,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        taxable: li.taxable,
        taxRateBps,
      })),
      aiDraftUsed: aiUsed,
    })

    if (result.success) {
      router.push(`/estimates/${result.estimateId}`)
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <>
      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg my-4">
        <div className="flex justify-between items-center">
          <div>
            <strong className="text-sm">AI Draft Assist</strong>
            <p className="text-xs text-muted-foreground mt-1">
              Generate a starting draft from job context. You can review and edit everything before saving.
            </p>
          </div>
          <Button
            type="button"
            onClick={handleAiDraft}
            disabled={aiLoading}
            size="sm"
            className="whitespace-nowrap"
          >
            {aiLoading ? 'Generating...' : 'Generate draft'}
          </Button>
        </div>
        {aiUsed && (
          <p className="text-xs text-emerald-600 mt-2">
            Draft generated. Review and edit before saving.
          </p>
        )}
      </div>

      {error && (
        <div className="text-destructive text-sm mb-4">{error}</div>
      )}

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

        <div className="mt-2">
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
          <div>
            <Label className="text-sm font-medium">Tax rate (%)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={(taxRateBps / 100).toFixed(2)}
              onChange={(e) => setTaxRateBps(Math.round(parseFloat(e.target.value || '0') * 100))}
              disabled={customerTaxExempt}
              className="mt-1"
            />
            {customerTaxExempt && (
              <p className="text-xs text-muted-foreground mt-1">Customer is tax-exempt</p>
            )}
          </div>
          <div>
            <Label className="text-sm font-medium">Tax</Label>
            <p className="text-base font-medium mt-1">{formatCents(taxCents)}</p>
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
            placeholder="Payment terms, warranty info, etc."
            className="mt-1 resize-y"
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Additional notes for the customer"
            className="mt-1 resize-y"
          />
        </div>

        <div className="flex gap-3 mt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save estimate'}
          </Button>
          <Link
            href={`/jobs/${jobId}` as never}
            className={buttonVariants({ variant: 'ghost' })}
          >
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
