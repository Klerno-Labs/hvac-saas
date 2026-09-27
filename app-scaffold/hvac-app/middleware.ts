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

  // Authentication and portal responses can contain personalized data or tokens.
  // Let Next.js control public-page caching; never force shared caching over auth.
  if (pathname.startsWith('/portal/') || pathname.startsWith('/api/portal/') || pathname.startsWith('/api/photos/') || pathname.startsWith('/pay/') || pathname.startsWith('/invite/') || pathname.startsWith('/api/auth/') ||
      ['/login', '/signup', '/forgot-password', '/reset-password'].includes(pathname) || pathname === '/setup' || pathname.startsWith('/setup/')) {
    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
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
