'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { type EstimateCatalogItem, type EstimateLineItemInput, catalogItemToLineItem } from '@/lib/pricebook-to-lineitem'

export function PriceBookPicker({
  items,
  onPick,
}: {
  items: EstimateCatalogItem[]
  onPick: (lineItem: EstimateLineItemInput) => void
}) {
  const [filter, setFilter] = useState('')
  const [source, setSource] = useState<'all' | EstimateCatalogItem['source']>('all')

  if (items.length === 0) return null

  const q = filter.toLowerCase()
  const filtered = items.filter(item => (source === 'all' || item.source === source) && (!q ||
    item.name.toLowerCase().includes(q) || (item.category?.toLowerCase().includes(q) ?? false)))

  return (
    <div className="border rounded-lg p-3 mb-4 bg-slate-50">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Price book &amp; inventory
      </p>
      <p className="text-xs text-muted-foreground mb-2">
        Add a saved service or part at its customer price. Adding a part does not reserve or reduce stock.
      </p>
      <select
        aria-label="Catalog source"
        value={source}
        onChange={event => setSource(event.target.value as typeof source)}
        className="w-full mb-2 h-8 rounded-md border bg-background px-2 text-sm"
      >
        <option value="all">All services and parts</option>
        <option value="service">Price book services</option>
        <option value="inventory">Inventory parts</option>
      </select>
      <Input
        aria-label="Filter services and parts"
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
              key={`${item.source}:${item.id}`}
              className="flex justify-between items-center py-1 px-2 rounded hover:bg-white text-sm"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{item.source === 'service' ? 'Service' : 'Inventory part'}</span>
                {item.category && (
                  <span className="text-xs text-muted-foreground ml-2">{item.category}</span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <span className="text-xs tabular-nums">
                  ${(item.unitPriceCents / 100).toFixed(2)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  aria-label={`Add ${item.name} (${item.source === 'service' ? 'service' : 'inventory part'})`}
                  onClick={() => onPick(catalogItemToLineItem(item))}
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
