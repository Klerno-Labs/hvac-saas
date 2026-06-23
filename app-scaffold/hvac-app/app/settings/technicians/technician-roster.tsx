'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTechnician, updateTechnician } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

type Technician = {
  id: string
  name: string
  color: string
  active: boolean
  assignedCount: number
}

const COLOR_SWATCHES = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316',
]

export function TechnicianRoster({ technicians }: { technicians: Technician[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setCreating(true)
    const formData = new FormData(e.currentTarget)
    const result = await createTechnician(formData)
    if (result.success) {
      e.currentTarget.reset()
      router.refresh()
    } else {
      setError(result.error)
    }
    setCreating(false)
  }

  async function handleUpdate(id: string, formData: FormData) {
    setError(null)
    const result = await updateTechnician(id, formData)
    if (result.success) {
      router.refresh()
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}

      {/* Existing technicians */}
      <div className="space-y-2">
        {technicians.length === 0 ? (
          <p className="text-sm text-muted-foreground">No technicians yet. Add your first below.</p>
        ) : (
          technicians.map((t) => (
            <form
              key={t.id}
              action={(formData) => handleUpdate(t.id, formData)}
              className="flex flex-wrap items-center gap-2 p-3 rounded-lg ring-1 ring-foreground/10 bg-card"
            >
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: t.color }}
              />
              <Input
                name="name"
                defaultValue={t.name}
                className="h-8 w-auto min-w-[160px] flex-1"
              />
              <input
                type="color"
                name="color"
                defaultValue={t.color}
                className="h-8 w-10 rounded-md border border-input bg-transparent cursor-pointer"
                title="Technician color"
              />
              <input type="hidden" name="active" value={(!t.active).toString()} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Save
              </Button>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-xs"
                formAction={(formData) => {
                  formData.set('active', t.active ? 'false' : 'true')
                  handleUpdate(t.id, formData)
                }}
              >
                {t.active ? 'Deactivate' : 'Activate'}
              </Button>
              <Badge variant={t.active ? 'secondary' : 'outline'}>
                {t.assignedCount} assigned
              </Badge>
            </form>
          ))
        )}
      </div>

      {/* Add form */}
      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2 pt-4 border-t">
        <div className="space-y-1">
          <Label htmlFor="name" className="text-xs">Name</Label>
          <Input id="name" name="name" required placeholder="e.g. Alex Rivera" className="h-8 w-56" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="color" className="text-xs">Color</Label>
          <select
            id="color"
            name="color"
            defaultValue=""
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Auto</option>
            {COLOR_SWATCHES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={creating}>
          {creating ? 'Adding…' : 'Add technician'}
        </Button>
      </form>
    </div>
  )
}
