'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createOptionGroup } from './new/actions'
import { updateOptionGroup, deleteOptionGroup } from './[groupId]/edit/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { OPTION_TIERS, TIER_LABELS, type OptionTier } from '@/lib/validations/price-book'

type OptionDraft = {
  tier: OptionTier
  name: string
  description: string
  priceCents: number
  costCents: string
}

type InitialOption = {
  id: string
  tier: string
  name: string
  description: string | null
  priceCents: number
  costCents: number | null
}

export type OptionGroupFormProps =
  | { mode: 'create' }
  | {
      mode: 'edit'
      groupId: string
      initial: {
        name: string
        category: string
        description: string
        options: InitialOption[]
      }
    }

function emptyTiers(): OptionDraft[] {
  return OPTION_TIERS.map((tier) => ({
    tier,
    name: '',
    description: '',
    priceCents: 0,
    costCents: '',
  }))
}

function fromInitial(options: InitialOption[]): OptionDraft[] {
  const byTier = new Map(options.map((o) => [o.tier, o]))
  return OPTION_TIERS.map((tier) => {
    const o = byTier.get(tier)
    return {
      tier,
      name: o?.name ?? '',
      description: o?.description ?? '',
      priceCents: o?.priceCents ?? 0,
      costCents: o?.costCents != null ? (o.costCents / 100).toFixed(2) : '',
    }
  })
}

function tierClass(tier: OptionTier): string {
  switch (tier) {
    case 'good': return 'bg-gray-500 text-white'
    case 'better': return 'bg-blue-600 text-white'
    case 'best': return 'bg-emerald-600 text-white'
    default: return 'bg-gray-500 text-white'
  }
}

export function OptionGroupForm(props: OptionGroupFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [name, setName] = useState(props.mode === 'edit' ? props.initial.name : '')
  const [category, setCategory] = useState(props.mode === 'edit' ? props.initial.category : '')
  const [description, setDescription] = useState(props.mode === 'edit' ? props.initial.description : '')
  const [options, setOptions] = useState<OptionDraft[]>(
    props.mode === 'edit' ? fromInitial(props.initial.options) : emptyTiers(),
  )

  function updateOption(tier: OptionTier, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((o) => (o.tier === tier ? { ...o, ...patch } : o)))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const offered = options.filter((o) => o.name.trim() !== '')
    if (offered.length === 0) {
      setError('Fill in at least one tier (Good, Better, or Best).')
      return
    }

    const payload = {
      name,
      category: category || undefined,
      description: description || undefined,
      options: offered.map((o) => ({
        tier: o.tier,
        name: o.name,
        description: o.description || undefined,
        priceCents: o.priceCents,
        costCents: o.costCents ? Math.round(parseFloat(o.costCents) * 100) : undefined,
      })),
    }

    setLoading(true)

    const result =
      props.mode === 'create'
        ? await createOptionGroup(payload)
        : await updateOptionGroup(props.groupId, payload)

    if (result.success) {
      router.push('/price-book')
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (props.mode !== 'create') {
      if (!confirm('Delete this option group? This cannot be undone. Existing estimates keep their line-item snapshots.')) {
        return
      }
      setDeleting(true)
      setError(null)
      const result = await deleteOptionGroup(props.groupId)
      if (result.success) {
        router.push('/price-book')
      } else {
        setError(result.error)
        setDeleting(false)
      }
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>{props.mode === 'create' ? 'New option group' : 'Edit option group'}</CardTitle>
          <CardDescription>
            A good / better / best bundle. Pick which tier to drop onto each estimate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Group name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Furnace replacement"
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
                  placeholder="e.g. Equipment"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-medium">Tiers</Label>
              <p className="text-xs text-muted-foreground">
                Leave a tier blank if you don&apos;t offer it. At least one tier is required.
              </p>
              {options.map((o) => (
                <div key={o.tier} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${tierClass(o.tier)}`}>
                      {TIER_LABELS[o.tier]}
                    </span>
                  </div>
                  <Input
                    placeholder={`${TIER_LABELS[o.tier]} option name`}
                    value={o.name}
                    onChange={(e) => updateOption(o.tier, { name: e.target.value })}
                  />
                  <Input
                    placeholder="Short description (optional)"
                    value={o.description}
                    onChange={(e) => updateOption(o.tier, { description: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Price ($)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={(o.priceCents / 100).toFixed(2)}
                        onChange={(e) =>
                          updateOption(o.tier, { priceCents: Math.round(parseFloat(e.target.value || '0') * 100) })
                        }
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Cost ($) (optional)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={o.costCents}
                        onChange={(e) => updateOption(o.tier, { costCents: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : props.mode === 'create' ? 'Create group' : 'Save changes'}
              </Button>
              <Button variant="ghost" type="button" onClick={() => router.push('/price-book')}>
                Cancel
              </Button>
              {props.mode === 'edit' && (
                <Button
                  variant="destructive"
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="ml-auto"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
