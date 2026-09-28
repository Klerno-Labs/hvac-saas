'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function CopyReferralButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link)
      setError(false)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { setError(true) }
  }

  return (
    <>
    <Button onClick={handleCopy} variant="default">
      {copied ? 'Copied!' : 'Copy link'}
    </Button>
    {error && <p role="alert" className="text-sm">Copy is unavailable. Select and copy the link above.</p>}
    </>
  )
}
