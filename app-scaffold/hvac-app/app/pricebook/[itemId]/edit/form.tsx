'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePriceBookItem, deletePriceBookItem } from '../../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { dollarsToCents } from '@/lib/pricebook-mappers'
import type { PriceBookFormState, OptionGroupFormState } from '@/lib/pricebook-mappers'

type Tier = 'good' | 'better' | 'best'

export function EditPriceBookForm({
  itemId,
  initialData,
}: {
  itemId: string
  initialData: PriceBookFormState
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [name, setName] = useState(initialData.name)
  const [category, setCategory] = useState(initialData.category)
  const [description, setDescription] = useState(initialData.description)
  const [flatPrice, setFlatPrice] = useState(initialData.flatPrice)
  const [cost, setCost] = useState(initialData.cost)
  const [imageUrl, setImageUrl] = useState(initialData.imageUrl)
  const [optionGroups, setOptionGroups] = useState<OptionGroupFormState[]>(
    initialData.optionGroups
  )

  function addGroup() {
    setOptionGroups([...optionGroups, { tier: 'good', name: '', description: '', price: '' }])
  }

  function removeGroup(index: number) {
    setOptionGroups(optionGroups.filter((_, i) => i !== index))
  }

  function updateGroup(index: number, field: keyof OptionGroupFormState, value: string) {
    const updated = [...optionGroups]
    updated[index] = { ...updated[index], [field]: value }
    setOptionGroups(updated)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await updatePriceBookItem(itemId, {
      name,
      category: category || undefined,
      description: description || undefined,
      flatPriceCents: dollarsToCents(flatPrice),
      costCents: cost ? dollarsToCents(cost) : undefined,
      imageUrl: imageUrl || undefined,
      optionGroups: optionGroups.map((g, i) => ({
        tier: g.tier as Tier,
        name: g.name,
        description: g.description || undefined,
        priceCents: dollarsToCents(g.price),
        sortOrder: i,
      })),
    })

    if (result.success) {
      router.push('/pricebook')
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deletePriceBookItem(itemId)
    if (result.success) {
      router.push('/pricebook')
    } else {
      setError(result.error)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Edit price-book item</h1>

      {error && (
        <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pb-name">Name *</Label>
          <Input
            id="pb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pb-category">Category</Label>
            <Input
              id="pb-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Tune-Up, Replacement"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pb-flatPrice">Flat price ($) *</Label>
            <Input
              id="pb-flatPrice"
              type="number"
              step="0.01"
              min="0"
              value={flatPrice}
              onChange={(e) => setFlatPrice(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pb-description">Description</Label>
          <Textarea
            id="pb-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pb-cost">Cost (internal) ($)</Label>
            <Input
              id="pb-cost"
              type="number"
              step="0.01"
              min="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pb-imageUrl">Image URL</Label>
            <Input
              id="pb-imageUrl"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <Label>Option groups (Good / Better / Best)</Label>
            <button
              type="button"
              onClick={addGroup}
              className="text-xs text-primary bg-transparent border-none cursor-pointer"
            >
              + Add option group
            </button>
          </div>

          {optionGroups.map((group, i) => (
            <div key={i} className="border rounded-lg p-3 mb-2">
              <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-start">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Tier</Label>
                  <Select
                    value={group.tier}
                    onValueChange={(val) => updateGroup(i, 'tier', val)}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="better">Better</SelectItem>
                      <SelectItem value="best">Best</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="Option name *"
                    value={group.name}
                    onChange={(e) => updateGroup(i, 'name', e.target.value)}
                    required
                  />
                  <Input
                    placeholder="Description"
                    value={group.description}
                    onChange={(e) => updateGroup(i, 'description', e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">
                      Price ($)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={group.price}
                      onChange={(e) => updateGroup(i, 'price', e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeGroup(i)}
                  className="bg-transparent border-none text-destructive cursor-pointer text-lg px-1 mt-5"
                  title="Remove group"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save changes'}
          </Button>
          <Button variant="ghost" type="button" onClick={() => router.push('/pricebook')}>
            Cancel
          </Button>
        </div>
      </form>

      <div className="mt-8 pt-6 border-t">
        {!confirmDelete ? (
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
            Delete item
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Are you sure?</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Yes, delete'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
