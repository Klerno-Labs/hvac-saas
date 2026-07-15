'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resendCompletionNotice } from './completion-notice-actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNoticeChannels } from '@/lib/format-notice-channels'

export function CompletionNoticeSection({
  jobId,
  jobStatus,
  sentAt,
  channels,
}: {
  jobId: string
  jobStatus: string
  sentAt: string | null
  channels: string | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (jobStatus !== 'completed') return null

  async function handleResend() {
    setLoading(true)
    setError(null)
    const result = await resendCompletionNotice(jobId)
    if ('error' in result) {
      setError(result.error)
    } else {
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg">Completion notice</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sentAt ? (
          <p className="text-sm text-muted-foreground">
            Customer notified on {new Date(sentAt).toLocaleDateString()} via{' '}
            {formatNoticeChannels(channels)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Customer not yet notified — sends automatically on completion.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button size="sm" variant="outline" onClick={handleResend} disabled={loading}>
          {loading ? 'Sending...' : 'Resend completion notice'}
        </Button>
      </CardContent>
    </Card>
  )
}
