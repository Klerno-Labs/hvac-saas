'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateFieldStatus } from './actions'
import { Button } from '@/components/ui/button'
import type { FieldStatus } from '@/lib/validations/field'

const ACTIONS: { value: FieldStatus; label: string; variant: 'default' | 'outline' }[] = [
  { value: 'en_route', label: 'En route', variant: 'outline' },
  { value: 'on_site', label: 'On site', variant: 'outline' },
  { value: 'done', label: 'Complete', variant: 'default' },
]

export function FieldStatusControls({
  jobId,
  currentFieldStatus,
}: {
  jobId: string
  currentFieldStatus: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<FieldStatus | null>(null)

  async function handleSet(next: FieldStatus) {
    if (next === currentFieldStatus) return
    setError(null)
    setPending(next)

    const formData = new FormData()
    formData.append('fieldStatus', next)
    const result = await updateFieldStatus(jobId, formData)

    if (result.success) {
      router.refresh()
    } else {
      setError(result.error)
    }
    setPending(null)
  }

  return (
    <div>
      {error && (
        <div className="text-sm text-destructive mb-3 p-3 bg-destructive/10 rounded-lg">
          {error}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {ACTIONS.map((action) => {
          const isCurrent = currentFieldStatus === action.value
          const isLoading = pending === action.value
          return (
            <Button
              key={action.value}
              type="button"
              variant={isCurrent ? 'default' : action.variant}
              size="sm"
              disabled={isLoading || pending !== null}
              onClick={() => handleSet(action.value)}
              className="w-full"
            >
              {isLoading ? '...' : action.label}
            </Button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {currentFieldStatus === 'done'
          ? 'Job marked complete. The office has been notified.'
          : 'Updating your status notifies the office in real time.'}
      </p>
    </div>
  )
}
