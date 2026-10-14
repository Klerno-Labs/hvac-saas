import type { MetadataRoute } from 'next'
import { helpArticles } from '@/lib/help/articles'
import { acquisitionPaths } from '@/lib/marketing/resources'
import { siteUrl } from '@/lib/marketing/site'

// Omit lastModified until a real editorial revision date is recorded.
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['/', '/pricing', '/faq', '/demo', '/help', '/terms', '/privacy', '/refund-policy', ...acquisitionPaths, ...helpArticles.map(article => '/help/' + article.slug)]
  return [...new Set(paths)].map(path => ({ url: new URL(path, siteUrl).toString() }))
}
