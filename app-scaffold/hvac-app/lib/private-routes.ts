import type { Metadata } from 'next'

// Match full path segments: /field is private, but /field-service-software is public.
export const PRIVATE_ROUTE_ROOTS = [
  '/dashboard', '/customers', '/jobs', '/estimates', '/invoices',
  '/reminders', '/reports', '/settings', '/onboarding', '/setup',
  '/field', '/inventory', '/recurring', '/calendar', '/pricebook',
  '/portal', '/pay', '/reviews', '/invite', '/api',
  '/login', '/signup', '/forgot-password', '/reset-password',
] as const

export function isPrivateRoute(pathname: string): boolean {
  return PRIVATE_ROUTE_ROOTS.some(root => pathname === root || pathname.startsWith(root + '/'))
}

export const privatePageMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
}
