'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resendCompletionNotice } from './completion-notice-actions'
import { Button } from '@/components/ui/button'

export function ResendNoticeButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleResend() {
    setLoading(true)
    setError(null)
    const result = await resendCompletionNotice(jobId)
    if ('error' in result) {
      setError(result.error)
    } else {
      setSent(true)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="space-y-2">
      {sent && <p className="text-sm text-green-600">Notice sent.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleResend} disabled={loading} size="sm" variant="outline">
        {loading ? 'Sending...' : 'Resend completion notice'}
      </Button>
    </div>
  )
}
