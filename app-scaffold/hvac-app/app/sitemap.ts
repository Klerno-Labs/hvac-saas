import type { MetadataRoute } from 'next'

const SITE_URL = process.env.APP_URL || 'https://fieldclose.app'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      // Trailing slash matches Google's canonical (Next.js redirects bare → slashed).
      // Without it, GSC reports homepage as a non-sitemap URL and the sitemap
      // entry shows 0 impressions even though traffic is landing fine.
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/signup`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/forgot-password`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
