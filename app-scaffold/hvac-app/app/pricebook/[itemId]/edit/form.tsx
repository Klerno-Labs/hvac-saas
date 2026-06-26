'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePriceBookItem, deletePriceBookItem } from '@/app/pricebook/actions'
import {
  dollarsToCents,
  type PriceBookFormState,
  type PriceBookOptionGroupFormRow,
} from '@/lib/pricebook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const EMPTY_OPTION: PriceBookOptionGroupFormRow = {
  tier: '',
  name: '',
  description: '',
  price: '',
}

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
  const [name, setName] = useState(initialData.name)
  const [category, setCategory] = useState(initialData.category)
  const [description, setDescription] = useState(initialData.description)
  const [flatPrice, setFlatPrice] = useState(initialData.flatPrice)
  const [cost, setCost] = useState(initialData.cost)
  const [imageUrl, setImageUrl] = useState(initialData.imageUrl)
  const [optionGroups, setOptionGroups] = useState<PriceBookOptionGroupFormRow[]>(
    initialData.optionGroups,
  )

  function addOptionGroup() {
    setOptionGroups([...optionGroups, { ...EMPTY_OPTION }])
  }

  function removeOptionGroup(i: number) {
    setOptionGroups(optionGroups.filter((_, idx) => idx !== i))
  }

  function updateOptionGroup(i: number, field: keyof PriceBookOptionGroupFormRow, value: string) {
    const updated = [...optionGroups]
    updated[i] = { ...updated[i], [field]: value }
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
      optionGroups: optionGroups
        .filter((og) => og.tier && og.name)
        .map((og, i) => ({
          tier: og.tier as 'good' | 'better' | 'best',
          name: og.name,
          description: og.description || undefined,
          priceCents: dollarsToCents(og.price),
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Edit price-book item</CardTitle>
          <CardDescription>Update this service or product in your price book.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Maintenance, Repairs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input
                  id="imageUrl"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="flatPrice">Flat price ($) *</Label>
                <Input
                  id="flatPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={flatPrice}
                  onChange={(e) => setFlatPrice(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Cost (internal) ($)</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Option groups (Good / Better / Best)</Label>
                <button
                  type="button"
                  onClick={addOptionGroup}
                  className="text-xs text-primary bg-transparent border-none cursor-pointer"
                >
                  + Add option
                </button>
              </div>
              {optionGroups.map((og, i) => (
                <div key={i} className="border rounded-lg p-3 mb-2">
                  <div className="grid grid-cols-[120px_1fr_auto] gap-2 items-start">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Tier</Label>
                      <Select
                        value={og.tier}
                        onValueChange={(v) => updateOptionGroup(i, 'tier', v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Tier" />
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
                        placeholder="Option name"
                        value={og.name}
                        onChange={(e) => updateOptionGroup(i, 'name', e.target.value)}
                      />
                      <Input
                        placeholder="Description (optional)"
                        value={og.description}
                        onChange={(e) => updateOptionGroup(i, 'description', e.target.value)}
                      />
                      <div>
                        <Label className="text-xs text-muted-foreground">Price ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={og.price}
                          onChange={(e) => updateOptionGroup(i, 'price', e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOptionGroup(i)}
                      className="bg-transparent border-none text-destructive cursor-pointer text-lg px-1"
                      title="Remove option"
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
              <Button
                variant="ghost"
                type="button"
                onClick={() => router.push('/pricebook')}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <DeletePriceBookItemButton itemId={itemId} />
    </div>
  )
}

function DeletePriceBookItemButton({ itemId }: { itemId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    const result = await deletePriceBookItem(itemId)
    if (result.success) {
      router.push('/pricebook')
    } else {
      setError(result.error)
      setLoading(false)
      setConfirming(false)
    }
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (!confirming) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
        Delete item
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Are you sure?</span>
      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
        {loading ? 'Deleting...' : 'Yes, delete'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  )
}
