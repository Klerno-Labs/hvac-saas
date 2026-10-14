import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

// Protect the boundary, including anonymous responses and future nested pages.
const privatePaths = [
  '/dashboard', '/customers/customer-one', '/jobs/job-one/proof-of-work',
  '/estimates/new', '/invoices/invoice-one', '/reminders', '/reports',
  '/settings/billing', '/onboarding', '/setup/business', '/field',
  '/inventory/new', '/recurring/schedule-one', '/calendar', '/pricebook/import',
  '/portal/bearer-secret/invoices/invoice-one', '/pay/invoice-one',
  '/reviews/bearer-secret', '/invite/bearer-secret', '/api/health',
  '/api/photos/photo-one', '/api/auth/session', '/login', '/signup',
  '/forgot-password', '/reset-password',
]
const publicPaths = [
  '/', '/pricing', '/faq', '/demo', '/help/getting-started',
  '/tools/paperwork-calculator', '/tools/hvac-margin-calculator',
  '/resources', '/resources/hvac-invoice-template', '/hvac-software',
  '/field-service-software', '/customer-management-software',
  '/terms', '/privacy', '/refund-policy', '/social-image', '/sitemap.xml',
]

describe('public caching and private search exclusion', () => {
  it.each(privatePaths)('keeps %s private and excluded from search', pathname => {
    const result = middleware(new NextRequest(`https://fieldclose.app${pathname}?token=private-value`))
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(result.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(result.headers.get('Referrer-Policy')).toBe('no-referrer')
    // Middleware decorates responses; page/API guards remain responsible for auth.
    expect(result.headers.get('location')).toBeNull()
  })
  it.each(publicPaths)('leaves %s eligible for Next.js static caching and search', pathname => {
    const result = middleware(new NextRequest(`https://fieldclose.app${pathname}`))
    expect(result.headers.get('Cache-Control')).toBeNull()
    expect(result.headers.get('X-Robots-Tag')).toBeNull()
    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})
