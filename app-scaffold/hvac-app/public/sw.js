'use strict'

const CACHE = 'fieldclose-v1'

const PRECACHE = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// Shared IDB store name — must match lib/offline-queue.ts
const DB_NAME = 'fieldclose-queue'
const STORE_NAME = 'writes'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Navigation to /jobs and /jobs/** — network-first, serve cached copy offline
  if (request.mode === 'navigate' && url.pathname.startsWith('/jobs')) {
    event.respondWith(networkFirstNav(request))
    return
  }

  // Static assets — cache-first
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image'
  ) {
    event.respondWith(cacheFirst(request))
    return
  }
})

async function networkFirstNav(request) {
  try {
    const response = await fetch(request)
    const cache = await caches.open(CACHE)
    cache.put(request, response.clone())
    return response
  } catch {
    const cached = await caches.match(request)
    return (
      cached ||
      new Response('Offline — reconnect to load this page.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      })
    )
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('', { status: 503 })
  }
}

// Background Sync — replays queued field writes from IndexedDB when back online.
// Fires even when the app is closed; primary flush is the client-side 'online' handler.
self.addEventListener('sync', (event) => {
  if (event.tag === 'field-sync') {
    event.waitUntil(flushQueue())
  }
})

async function flushQueue() {
  let db
  try {
    db = await openDb()
  } catch {
    return
  }
  const entries = await getAllEntries(db)
  for (const { key, value } of entries) {
    try {
      const res = await fetch('/api/field-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })
      if (res.ok) await deleteEntry(db, key)
    } catch {
      // Network still down — will retry on next sync event
    }
  }
}

function getAllEntries(db) {
  return new Promise((resolve, reject) => {
    const entries = []
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        entries.push({ key: cursor.key, value: cursor.value })
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolve(entries)
    tx.onerror = () => reject(tx.error)
  })
}

function deleteEntry(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
