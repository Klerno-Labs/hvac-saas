'use client'

import { useEffect } from 'react'
import { dequeueAll, removeWrite } from '@/lib/offline-queue'

async function flushQueue(): Promise<void> {
  try {
    const items = await dequeueAll()
    for (const { key, write } of items) {
      const res = await fetch('/api/field-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(write),
      })
      if (res.ok) await removeWrite(key)
    }
  } catch {
    // Retry on next online event or SW Background Sync
  }
}

export function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Register Background Sync on startup so items from a closed-app offline
          // session are flushed when the browser reconnects, even if the page isn't open.
          const regWithSync = reg as ServiceWorkerRegistration & {
            sync?: { register(tag: string): Promise<void> }
          }
          regWithSync.sync?.register('field-sync').catch(() => {})
        })
        .catch(() => {})
    }

    // Flush any queued writes from a previous offline session on mount
    if (navigator.onLine) flushQueue()

    window.addEventListener('online', flushQueue)
    return () => window.removeEventListener('online', flushQueue)
  }, [])

  return null
}
