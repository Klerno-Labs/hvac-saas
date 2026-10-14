import type { Metadata } from 'next'
import { siteUrl } from './site'

/** Complete metadata: Next replaces nested Open Graph objects instead of merging them. */
export function marketingMetadata({ title, description, path, article = false }: {
  title: string; description: string; path: string; article?: boolean
}): Metadata {
  const url = new URL(path, siteUrl).toString()
  const fullTitle = `${title} | FieldClose`
  const images = [{ url: `${siteUrl}/social-image`, width: 1200, height: 630, alt: 'FieldClose — estimates, jobs, invoices and payments' }]
  return {
    title: { absolute: fullTitle }, description,
    alternates: { canonical: url },
    openGraph: { title: fullTitle, description, url, siteName: 'FieldClose', type: article ? 'article' : 'website', images },
    twitter: { card: 'summary_large_image', title: fullTitle, description, images: images.map(image => image.url) },
  }
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((item, index) => ({
    '@type': 'ListItem', position: index + 1, name: item.name, item: new URL(item.path, siteUrl).toString(),
  })) }
}
