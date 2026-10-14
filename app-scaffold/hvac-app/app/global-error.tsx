'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({ error, reset }: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return
    try {
      // The client SDK applies the shared privacy filter before delivery.
      Sentry.captureException(error)
    } catch {
      // A monitoring failure must not prevent the user from trying again.
    }
  }, [error])

  // This boundary replaces the root layout, so it supplies its own document
  // and styles without depending on the application shell or its providers.
  return (
    <html lang="en">
      <head><title>Try again | FieldClose</title></head>
      <body style={{ margin: 0, background: '#f8faf7', color: '#18211b', fontFamily: 'Arial, sans-serif' }}>
        <style>{`
          .fieldclose-recovery a:focus-visible,
          .fieldclose-recovery button:focus-visible { outline: 3px solid #18211b; outline-offset: 4px; }
        `}</style>
        <main className="fieldclose-recovery" aria-labelledby="recovery-title" style={{ minHeight: '100dvh', display: 'grid', alignContent: 'center', padding: '32px 24px', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', maxWidth: 560, margin: '0 auto' }}>
            <p style={{ fontSize: 19, fontWeight: 700, marginBottom: 32 }}>FieldClose.</p>
            <h1 id="recovery-title" style={{ fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1.15, letterSpacing: '-0.03em', margin: '0 0 16px' }}>We couldn’t load this page.</h1>
            <p style={{ color: '#536158', lineHeight: 1.6, margin: '0 0 24px' }}>Please try again. If it keeps happening, come back in a few minutes.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
              <button type="button" onClick={reset} style={{ minHeight: 48, padding: '12px 22px', border: '1px solid #d4e43b', borderRadius: 8, background: '#e6f64e', color: '#18211b', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Try again</button>
              <a href="/dashboard" style={{ display: 'inline-flex', minHeight: 48, alignItems: 'center', padding: '0 8px', color: '#18211b', fontWeight: 600, textUnderlineOffset: 4 }}>Go to dashboard</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
