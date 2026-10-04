import { describe, expect, it } from 'vitest'
import type { Metadata } from 'next'
import { metadata as home } from '@/app/(marketing)/page'
import { metadata as pricing } from '@/app/(marketing)/pricing/page'
import { metadata as faq } from '@/app/(marketing)/faq/page'
import { metadata as demo } from '@/app/(marketing)/demo/page'
import { metadata as help, } from '@/app/(marketing)/help/page'
import { generateMetadata as helpMetadata } from '@/app/(marketing)/help/[slug]/page'
import { metadata as resources } from '@/app/(marketing)/resources/page'
import { metadata as invoicing } from '@/app/(marketing)/hvac-invoicing-software/page'
import { metadata as estimating } from '@/app/(marketing)/hvac-estimating-software/page'
import { metadata as invoiceTemplate } from '@/app/(marketing)/resources/hvac-invoice-template/page'
import { metadata as estimateTemplate } from '@/app/(marketing)/resources/hvac-estimate-template/page'
import { metadata as checklist } from '@/app/(marketing)/resources/hvac-software-checklist/page'
import { metadata as jobPricing } from '@/app/(marketing)/tools/hvac-job-pricing-calculator/page'
import { metadata as paperwork } from '@/app/(marketing)/tools/paperwork-calculator/page'
import { helpArticles } from '@/lib/help/articles'
import { acquisitionPaths } from '@/lib/marketing/resources'
import { siteUrl } from '@/lib/marketing/site'
import { jsonLd, breadcrumbSchema } from '@/lib/marketing/seo'
import { isPublicFunnelPath, sanitizedPublicEventUrl } from '@/lib/public-funnel'
import sitemap from '@/app/sitemap'

const publicPages: [string, Metadata][] = [
  ['/', home], ['/pricing', pricing], ['/faq', faq], ['/demo', demo], ['/help', help],
  ['/resources', resources], ['/hvac-invoicing-software', invoicing],
  ['/hvac-estimating-software', estimating], ['/resources/hvac-invoice-template', invoiceTemplate],
  ['/resources/hvac-estimate-template', estimateTemplate], ['/resources/hvac-software-checklist', checklist],
  ['/tools/hvac-job-pricing-calculator', jobPricing], ['/tools/paperwork-calculator', paperwork],
]
const expectedAcquisitionPaths = [
  '/resources', '/hvac-estimating-software', '/hvac-invoicing-software',
  '/resources/hvac-invoice-template', '/resources/hvac-estimate-template',
  '/resources/hvac-software-checklist', '/tools/hvac-job-pricing-calculator',
  '/tools/paperwork-calculator',
]
const privatePaths = [
  '/signup', '/login', '/forgot-password', '/reset-password', '/onboarding',
  '/dashboard', '/customers/customer-id', '/jobs/job-id', '/invoices/invoice-id',
  '/estimates/estimate-id', '/settings/billing', '/setup', '/pricebook',
  '/portal/bearer-secret', '/pay/invoice-id', '/reviews/bearer-secret',
  '/invite/bearer-secret', '/api/health',
]

function expectCompleteMetadata(path: string, metadata: Metadata) {
  const expected = new URL(path, siteUrl).toString()
  expect(metadata.alternates?.canonical).toBe(expected)
  expect(metadata.description?.trim().length).toBeGreaterThan(30)
  expect(metadata.openGraph).toBeDefined()
  expect(metadata.openGraph?.url?.toString()).toBe(expected)
  expect(metadata.openGraph?.description).toBe(metadata.description)
  expect(metadata.openGraph?.title).toBeTruthy()
  expect(metadata.twitter).toBeDefined()
  expect(metadata.twitter?.title).toEqual(metadata.openGraph?.title)
  expect(metadata.twitter?.description).toBe(metadata.description)
  expect(metadata.twitter).toHaveProperty('card', 'summary_large_image')
  for (const images of [metadata.openGraph?.images, metadata.twitter?.images]) {
    expect(Array.isArray(images)).toBe(true)
    const imageList = images as Array<string | URL | { url: string | URL }>
    expect(imageList.length).toBeGreaterThan(0)
    for (const image of imageList) {
      const raw = typeof image === 'string' || image instanceof URL ? image : image.url
      expect(new URL(raw.toString(), siteUrl).toString()).toBe(`${siteUrl}/social-image`)
    }
  }
}

describe('acquisition discovery and metadata', () => {
  it('includes every planned acquisition destination exactly once with no invented modification date', () => {
    expect([...acquisitionPaths].sort()).toEqual([...expectedAcquisitionPaths].sort())
    const entries = sitemap()
    const urls = entries.map(entry => entry.url)
    expect(new Set(urls).size).toBe(urls.length)
    for (const path of [...expectedAcquisitionPaths, ...publicPages.map(([path]) => path), ...helpArticles.map(article => `/help/${article.slug}`)]) {
      expect(urls.filter(url => url === new URL(path, siteUrl).toString())).toHaveLength(1)
    }
    for (const entry of entries) {
      const parsed = new URL(entry.url)
      expect(parsed.origin).toBe(siteUrl)
      expect(parsed.search).toBe('')
      expect(parsed.hash).toBe('')
      expect(entry.lastModified).toBeUndefined()
    }
    for (const path of privatePaths) expect(urls).not.toContain(new URL(path, siteUrl).toString())
  })

  it.each(publicPages)('gives %s its own canonical and complete social cards', (path, metadata) => {
    expectCompleteMetadata(path, metadata)
  })

  it.each(helpArticles)('gives the $slug guide a complete article card', async article => {
    const metadata = await helpMetadata({ params: Promise.resolve({ slug: article.slug }) })
    expectCompleteMetadata(`/help/${article.slug}`, metadata)
    expect(metadata.openGraph).toHaveProperty('type', 'article')
  })

  it('keeps nonexistent articles excluded from indexing instead of returning homepage metadata', async () => {
    const metadata = await helpMetadata({ params: Promise.resolve({ slug: 'not-a-real-guide' }) })
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.alternates?.canonical).toBeUndefined()
  })
})

describe('acquisition analytics privacy boundary', () => {
  it.each(expectedAcquisitionPaths)('allows the published %s path but strips user input', path => {
    expect(isPublicFunnelPath(path)).toBe(true)
    expect(sanitizedPublicEventUrl(`${siteUrl}${path}?email=private@example.test&token=private#customer-name`)).toBe(`${siteUrl}${path}`)
  })
  it.each([...privatePaths, '/resources/not-a-published-page', '/resources/../../portal/bearer-secret', '/tools/private-customer-data'])('rejects private or unapproved destination %s', path => {
    expect(isPublicFunnelPath(path)).toBe(false)
    expect(sanitizedPublicEventUrl(`${siteUrl}${path}?token=private`)).toBeNull()
  })
})

describe('safe structured data rendering', () => {
  it('cannot terminate a JSON-LD script through content while preserving the original data', () => {
    const data = { '@context': 'https://schema.org', name: '</script><script>alert("unsafe")</script><!--', description: 'Margin < 50% & text\u2028with a separator' }
    const encoded = jsonLd(data)
    expect(encoded).not.toContain('<')
    expect(encoded).not.toMatch(/<\/script/i)
    expect(JSON.parse(encoded)).toEqual(data)
    expect(encoded).toContain('\\u003c/script>')
  })
  it('uses ordered absolute breadcrumb destinations without carrying search parameters', () => {
    const schema = breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Resources', path: '/resources' }, { name: 'Invoice template', path: '/resources/hvac-invoice-template' }])
    expect(schema['@type']).toBe('BreadcrumbList')
    expect(schema.itemListElement.map(item => item.position)).toEqual([1, 2, 3])
    expect(schema.itemListElement.map(item => item.item)).toEqual([`${siteUrl}/`, `${siteUrl}/resources`, `${siteUrl}/resources/hvac-invoice-template`])
  })
})
