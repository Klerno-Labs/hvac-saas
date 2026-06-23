'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveTechnicianNotes } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function TechnicianNotesForm({
  jobId,
  initialNotes,
}: {
  jobId: string
  initialNotes: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    setSaved(false)

    const formData = new FormData(e.currentTarget)
    const result = await saveTechnicianNotes(jobId, formData)

    if (result.success) {
      setSaved(true)
      router.refresh()
    } else {
      setError(result.error)
    }
    setSaving(false)
  }

  return (
    <div>
      {error && (
        <div className="text-sm text-destructive mb-3 p-3 bg-destructive/10 rounded-lg">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={initialNotes}
          placeholder="Add notes about this job — what you found, what you did, follow-ups needed..."
        />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving...' : 'Save notes'}
          </Button>
          {saved && !error && (
            <span className="text-xs text-muted-foreground">Saved</span>
          )}
        </div>
      </form>
    </div>
  )
}
