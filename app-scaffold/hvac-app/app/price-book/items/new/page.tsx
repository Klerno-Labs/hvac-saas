'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPriceBookItem } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export default function NewPriceBookItemPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await createPriceBookItem(formData)

    if (result.success) {
      router.push('/price-book')
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>New price book item</CardTitle>
          <CardDescription>A flat-rate service or part you can drop onto estimates.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input id="category" name="category" placeholder="e.g. Maintenance, Repairs" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input id="imageUrl" name="imageUrl" placeholder="https://..." />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={3} />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="flatPrice">Flat price ($) *</Label>
                <Input id="flatPrice" name="flatPrice" type="number" step="0.01" min="0" defaultValue="0" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Cost ($) (optional)</Label>
                <Input id="cost" name="cost" type="number" step="0.01" min="0" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Add item'}
              </Button>
              <Button variant="ghost" type="button" onClick={() => router.push('/price-book')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
