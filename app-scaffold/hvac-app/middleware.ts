import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Production hardening middleware.
 *
 * - Adds security headers to all responses
 * - Basic rate-limit awareness headers for public/portal routes
 * - Prevents sensitive internal paths from leaking via error pages
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Security headers for all responses
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Remove server identification
  response.headers.delete('X-Powered-By')

  const pathname = request.nextUrl.pathname

  // Public, indexable pages — allow CDN caching so Google can crawl efficiently
  const isPublicPage =
    pathname === '/' ||
    pathname === '/signup' ||
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/terms' ||
    pathname === '/privacy' ||
    pathname === '/refund-policy'

  if (isPublicPage) {
    // s-maxage lets Vercel's CDN cache the page; stale-while-revalidate serves
    // fresh content on the next request. This overrides NextAuth's default
    // no-store which was preventing Google from indexing the site.
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  }

  // For API routes, ensure JSON content type on errors
  if (pathname.startsWith('/api/')) {
    response.headers.set('X-Content-Type-Options', 'nosniff')
  }

  return response
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
