import type { MetadataRoute } from 'next'

const SITE_URL = process.env.APP_URL || 'https://fieldclose.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/signup', '/login', '/forgot-password', '/reset-password', '/terms', '/privacy', '/refund-policy'],
        disallow: [
          '/dashboard',
          '/customers',
          '/jobs',
          '/estimates',
          '/invoices',
          '/reminders',
          '/reports',
          '/settings',
          '/onboarding',
          '/inventory',
          '/recurring',
          '/calendar',
          '/portal/',
          '/pay/',
          '/reviews/',
          '/invite/',
          '/api/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
