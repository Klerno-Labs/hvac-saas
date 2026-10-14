'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toggleCollectionsPause, dismissCollectionAttempt } from './collections-actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { collectionDeliverySummary } from '@/lib/collection-delivery'

type Attempt = {
  id: string
  stage: string
  status: string
  notes: string | null
  createdAt: Date
}

export function CollectionsSection({
  invoiceId,
  collectionsPaused,
  attempts,
}: {
  invoiceId: string
  collectionsPaused: boolean
  attempts: Attempt[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleTogglePause() {
    setError(null)
    setLoading(true)

    const result = await toggleCollectionsPause(invoiceId, !collectionsPaused)
    if (result.success) {
      router.refresh()
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  async function handleDismiss(attemptId: string) {
    const result = await dismissCollectionAttempt(attemptId)
    if (result.success) {
      router.refresh()
    }
  }

  return (
    <div>
      {error && (
        <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}

      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Collections status:</span>
          <Badge variant={collectionsPaused ? 'outline' : 'secondary'} className={collectionsPaused ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-green-50 text-green-800 border-green-200'}>
            {collectionsPaused ? 'Paused' : 'Active'}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTogglePause}
          disabled={loading}
        >
          {loading ? '...' : collectionsPaused ? 'Resume collections' : 'Pause collections'}
        </Button>
      </div>

      {attempts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No collection attempts yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {attempts.map((a) => (
            <div key={a.id} className="flex justify-between items-center py-1.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{a.stage.replace(/_/g, ' ')}</span>
                <Badge variant={attemptBadgeVariant(a.status)} className={attemptBadgeClass(a.status)}>
                  {a.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{collectionDeliverySummary(a.notes, a.status)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(a.createdAt).toLocaleDateString()}
                </span>
                {['created', 'retry', 'partial', 'review'].includes(a.status) && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleDismiss(a.id)}
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function attemptBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'created': return 'default'
    case 'sent': return 'secondary'
    default: return 'outline'
  }
}

function attemptBadgeClass(status: string): string {
  switch (status) {
    case 'created': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'sent': return 'bg-green-50 text-green-800 border-green-200'
    case 'skipped': return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'dismissed': return 'bg-gray-100 text-gray-500 border-gray-200'
    default: return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}
