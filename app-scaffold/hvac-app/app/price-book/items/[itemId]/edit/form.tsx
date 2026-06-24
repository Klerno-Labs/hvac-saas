'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePriceBookItem, deletePriceBookItem } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

type Initial = {
  name: string
  category: string
  description: string
  flatPriceCents: number
  costCents: number | null
  imageUrl: string
}

export function PriceBookItemEditForm({ itemId, initial }: { itemId: string; initial: Initial }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await updatePriceBookItem(itemId, formData)

    if (result.success) {
      router.push('/price-book')
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this price book item? This cannot be undone. Existing estimates keep their line-item snapshots.')) {
      return
    }
    setDeleting(true)
    setError(null)
    const result = await deletePriceBookItem(itemId)
    if (result.success) {
      router.push('/price-book')
    } else {
      setError(result.error)
      setDeleting(false)
    }
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Edit price book item</CardTitle>
          <CardDescription>Changes do not affect estimates already quoted.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" defaultValue={initial.name} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input id="category" name="category" defaultValue={initial.category} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input id="imageUrl" name="imageUrl" defaultValue={initial.imageUrl} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={3} defaultValue={initial.description} />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="flatPrice">Flat price ($) *</Label>
                <Input
                  id="flatPrice"
                  name="flatPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(initial.flatPriceCents / 100).toFixed(2)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Cost ($) (optional)</Label>
                <Input
                  id="cost"
                  name="cost"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={initial.costCents != null ? (initial.costCents / 100).toFixed(2) : ''}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save changes'}
              </Button>
              <Button variant="ghost" type="button" onClick={() => router.push('/price-book')}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="ml-auto"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
