import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { getHelpArticle, getRelatedArticles, helpArticles, helpCategories } from '@/lib/help/articles'
import { searchHelpArticles } from '@/lib/help/search'
import { PHOTO_SIZE_LIMIT } from '@/lib/photo-upload'

vi.mock('@/lib/marketing/site', () => ({ siteUrl: 'https://fieldclose.app', supportEmail: 'support@fieldclose.app' }))
import HelpPage, { metadata } from '@/app/(marketing)/help/page'
import HelpArticlePage, { generateStaticParams, generateMetadata, dynamicParams } from '@/app/(marketing)/help/[slug]/page'
import { HelpSearch } from '@/app/(marketing)/help/help-search'

describe('Help Center search', () => {
  it('shows all guides for an empty query and supports topic-only browsing', () => {
    expect(searchHelpArticles('   ')).toEqual(helpArticles)
    for (const category of helpCategories) {
      const results = searchHelpArticles('', category)
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(article => article.category === category)).toBe(true)
    }
  })
  it.each([
    ['How do I reset my password?', 'account-and-password'],
    ['CSV import', 'team-and-imports'],
    ['quote approval', 'estimates-and-approvals'],
    ['partial payments', 'invoices-and-payments'],
    ['cancel subscription', 'subscription-and-billing'],
    ['offline photos', 'field-work-and-offline'],
    ['QuickBooks', 'exports-and-accounting'],
    ['SÉTUP', 'getting-started'],
  ])('finds the relevant workflow for %s', (query, slug) => {
    expect(searchHelpArticles(query)[0]?.slug).toBe(slug)
  })
  it('requires all meaningful terms and honors the selected category', () => {
    expect(searchHelpArticles('password nonexistentworkflow')).toEqual([])
    expect(searchHelpArticles('password', 'Quotes & payments')).toEqual([])
    expect(searchHelpArticles('payment', 'Quotes & payments').every(article => article.category === 'Quotes & payments')).toBe(true)
  })
  it('treats markup and wildcard input as plain search text', () => {
    expect(searchHelpArticles('<script>alert(1)</script>')).toEqual([])
    expect(searchHelpArticles('***')).toEqual(helpArticles)
  })
})

describe('Help Center content and navigation', () => {
  it('has unique safe routes, useful sections, and contextual related articles', () => {
    expect(new Set(helpArticles.map(article => article.slug)).size).toBe(helpArticles.length)
    for (const article of helpArticles) {
      expect(article.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(article.sections.length).toBeGreaterThanOrEqual(3)
      expect(new Set(article.sections.map(section => section.id)).size).toBe(article.sections.length)
      expect(getRelatedArticles(article).map(item => item.slug)).toEqual(article.related)
      expect(article.related).not.toContain(article.slug)
    }
    for (const slug of ['__proto__', 'constructor', '../settings', '%2e%2e', 'unknown']) expect(getHelpArticle(slug)).toBeUndefined()
  })
  it('links only to implemented local screens, known help sections, and support email', () => {
    for (const article of helpArticles) for (const section of article.sections) for (const link of section.links ?? []) {
      expect(link.label.trim()).not.toBe('')
      if (link.href.startsWith('mailto:')) {
        expect(link.href).toMatch(/^mailto:support@fieldclose\.app(?:\?|$)/)
        continue
      }
      expect(link.href).toMatch(/^\/(?!\/)/)
      const url = new URL(link.href, 'https://fieldclose.app')
      if (url.pathname.startsWith('/help/')) {
        const linked = getHelpArticle(url.pathname.slice('/help/'.length))
        expect(linked, link.href).toBeDefined()
        if (url.hash) expect(linked!.sections.map(item => item.id)).toContain(url.hash.slice(1))
      } else {
        const suffix = url.pathname.replace(/^\//, '')
        expect(['app', 'app/(marketing)'].some(root => existsSync(path.join(process.cwd(), root, suffix, 'page.tsx'))), link.href).toBe(true)
      }
    }
  })
  it('preserves material product limits without publishing duplicate plan prices or support promises', () => {
    const content = JSON.stringify(helpArticles)
    expect(content).not.toMatch(/\$\d|24\/7|guaranteed response|priority support|instant support/i)
    expect(content).toContain('full invoice amount')
    expect(content).toContain('deposit checkout')
    expect(content).toContain('not a fully offline app')
    expect(content).toContain('does not currently connect or sync directly with QuickBooks or Xero')
    expect(content).toContain(PHOTO_SIZE_LIMIT)
    expect(content).toContain('50,000-record limit')
    expect(content).toContain('First name and phone are required')
  })
})

describe('Help Center public rendering', () => {
  it('renders searchable guidance and article links without authentication or client JavaScript', () => {
    const html = renderToStaticMarkup(React.createElement(HelpPage))
    expect(html).toContain('id="marketing-content"')
    expect(html).toContain('role="search"')
    expect(html).toContain('for="help-search"')
    expect(html).toContain('aria-controls="help-results"')
    expect(html).toContain('aria-live="polite"')
    for (const article of helpArticles) expect(html).toContain(`href="/help/${article.slug}"`)
    expect(metadata.alternates?.canonical).toBe('https://fieldclose.app/help')
  })
  it('renders a useful no-results state with a recovery action and support route', () => {
    const html = renderToStaticMarkup(React.createElement(HelpSearch, { initialQuery: 'unfindableworkflow' }))
    expect(html).toContain('No articles found')
    expect(html).toContain('Clear search and filters')
    expect(html).toContain('href="/help/account-and-password#support"')
    expect(html).toContain('0 articles')
  })
  it('pre-renders every known article with matching metadata, section anchors, and related guides', async () => {
    expect(dynamicParams).toBe(false)
    expect(generateStaticParams()).toEqual(helpArticles.map(article => ({ slug: article.slug })))
    for (const article of helpArticles) {
      const params = Promise.resolve({ slug: article.slug })
      const meta = await generateMetadata({ params })
      expect(meta.title).toBe(article.title)
      expect(meta.alternates?.canonical).toBe(`https://fieldclose.app/help/${article.slug}`)
      const html = renderToStaticMarkup(await HelpArticlePage({ params }))
      expect(html).toContain('aria-label="On this page"')
      for (const section of article.sections) {
        expect(html).toContain(`href="#${section.id}"`)
        expect(html).toContain(`id="${section.id}"`)
      }
      for (const related of article.related) expect(html).toContain(`href="/help/${related}"`)
    }
  })
  it('returns a real not-found response for an unknown article', async () => {
    const params = Promise.resolve({ slug: 'unknown' })
    expect((await generateMetadata({ params })).robots).toEqual({ index: false, follow: false })
    await expect(HelpArticlePage({ params })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
  })
})
