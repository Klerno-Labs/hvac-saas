import type { MetadataRoute } from 'next'

const SITE_URL = new URL(process.env.APP_URL || 'https://fieldclose.app').origin

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/customers',
          '/jobs',
          '/estimates',
          '/invoices',
          '/reminders',
          '/reports',
          '/settings',
          '/pricebook',
          '/onboarding',
          '/setup',
          '/field',
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
