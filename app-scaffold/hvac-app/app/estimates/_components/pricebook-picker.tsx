'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  type PriceBookItemForPicker,
  inventoryItemToLineItem,
  type EstimateLineItem,
} from '@/lib/pricebook-to-lineitem'

export function PriceBookPicker({
  items,
  onPick,
}: {
  items: PriceBookItemForPicker[]
  onPick: (lineItem: EstimateLineItem) => void
}) {
  const [query, setQuery] = useState('')

  if (items.length === 0) return null

  const q = query.toLowerCase()
  const filtered = items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      (item.category?.toLowerCase().includes(q) ?? false),
  )

  return (
    <div className="border rounded-lg p-3 mb-4 bg-slate-50">
      <p className="text-sm font-medium mb-2">Add from price book</p>
      <Input
        placeholder="Search items…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-2 bg-white"
      />
      <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded px-2 py-1 hover:bg-slate-100"
          >
            <div className="min-w-0">
              <span className="text-sm font-medium truncate block">{item.name}</span>
              {item.category && (
                <span className="text-xs text-muted-foreground">{item.category}</span>
              )}
            </div>
            <div className="flex items-center gap-2 ml-2 shrink-0">
              <span className="text-sm text-muted-foreground">
                ${(item.sellPriceCents / 100).toFixed(2)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onPick(inventoryItemToLineItem(item))}
                className="h-7 px-2"
              >
                Add
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground py-2 text-center">No items match</p>
        )}
      </div>
    </div>
  )
}
