'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { confirmRequest, rejectRequest } from './actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RequestRow = {
  id: string
  status: string
  customerFirstName: string
  customerLastName: string | null
}

export function RequestActions({
  request,
  organizationId,
}: {
  request: RequestRow
  organizationId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<'confirm' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmedJobId, setConfirmedJobId] = useState<string | null>(null)

  if (request.status !== 'new') {
    return <span className="text-xs text-muted-foreground">Handled</span>
  }

  async function handle(action: 'confirm' | 'reject') {
    setError(null)
    setLoading(action)
    const result = action === 'confirm'
      ? await confirmRequest(request.id)
      : await rejectRequest(request.id)
    setLoading(null)
    if (result.success) {
      if (action === 'confirm' && result.jobId) setConfirmedJobId(result.jobId)
      router.refresh()
    } else {
      setError(result.error)
    }
  }

  if (confirmedJobId) {
    return (
      <Link
        href={`/jobs/${confirmedJobId}` as never}
        className="no-underline text-xs text-primary hover:underline"
      >
        View created job →
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button
        size="sm"
        onClick={() => handle('confirm')}
        disabled={loading !== null}
        className={cn('no-underline')}
      >
        {loading === 'confirm' ? 'Confirming...' : 'Confirm'}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handle('reject')}
        disabled={loading !== null}
      >
        {loading === 'reject' ? 'Rejecting...' : 'Dismiss'}
      </Button>
    </div>
  )
}
