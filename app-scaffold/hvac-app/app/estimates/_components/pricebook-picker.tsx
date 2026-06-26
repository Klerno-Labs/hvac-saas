'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { type PriceBookItem, type EstimateLineItemInput, priceBookItemToLineItem } from '@/lib/pricebook-to-lineitem'

export function PriceBookPicker({
  items,
  onPick,
}: {
  items: PriceBookItem[]
  onPick: (lineItem: EstimateLineItemInput) => void
}) {
  const [filter, setFilter] = useState('')

  if (items.length === 0) return null

  const q = filter.toLowerCase()
  const filtered = q
    ? items.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          (it.category?.toLowerCase().includes(q) ?? false),
      )
    : items

  return (
    <div className="border rounded-lg p-3 mb-4 bg-slate-50">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Price book
      </p>
      <Input
        placeholder="Filter by name or category..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-2 h-8 text-sm"
      />
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No items match.</p>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center py-1 px-2 rounded hover:bg-white text-sm"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate">{item.name}</span>
                {item.category && (
                  <span className="text-xs text-muted-foreground ml-2">{item.category}</span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <span className="text-xs tabular-nums">
                  ${(item.sellPriceCents / 100).toFixed(2)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => onPick(priceBookItemToLineItem(item))}
                >
                  Add
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
