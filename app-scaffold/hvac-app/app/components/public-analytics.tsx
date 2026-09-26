
'use client'
import { Analytics } from '@vercel/analytics/react'
import { usePathname } from 'next/navigation'

// Portal URLs are bearer credentials. Never transmit them to analytics.
export function PublicAnalytics() {
  const pathname = usePathname()
  const isPublic = pathname === '/' || pathname === '/pricing' || pathname === '/faq' || pathname === '/blog' || pathname.startsWith('/blog/')
  if (!isPublic) return null
  return <Analytics beforeSend={event => {
    const url = new URL(event.url)
    if (!(url.pathname === '/' || url.pathname === '/pricing' || url.pathname === '/faq' || url.pathname === '/blog' || url.pathname.startsWith('/blog/'))) return null
    url.search = ''; url.hash = ''
    return {...event, url: url.toString()}
  }} />
}
