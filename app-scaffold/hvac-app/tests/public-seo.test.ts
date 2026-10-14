import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { metadata as terms } from '@/app/terms/page'
import { metadata as privacy } from '@/app/privacy/page'
import { metadata as refunds } from '@/app/refund-policy/page'
import { metadata as signup } from '@/app/signup/layout'
import { metadata as login } from '@/app/login/layout'
import { metadata as forgotPassword } from '@/app/forgot-password/layout'
import { metadata as home } from '@/app/(marketing)/page'
import sitemap from '@/app/sitemap'

describe('public search metadata', () => {
  it('gives policy pages their own canonical URLs matching the sitemap', () => {
    const entries = sitemap().map(entry => entry.url)
    const origin = new URL(process.env.APP_URL || 'https://fieldclose.app').origin
    for (const [route, metadata] of [['terms', terms], ['privacy', privacy], ['refund-policy', refunds]] as const) {
      expect(new URL(metadata.alternates!.canonical as string, origin).href).toBe(`${origin}/${route}`)
      expect(entries).toContain(`${origin}/${route}`)
      expect(metadata.description!.length).toBeGreaterThanOrEqual(120)
      expect(metadata.description!.length).toBeLessThanOrEqual(160)
    }
  })

  it('keeps account forms out of search results and the sitemap without blocking link discovery', () => {
    const paths = sitemap().map(entry => new URL(entry.url).pathname)
    for (const [route, metadata] of [['signup', signup], ['login', login], ['forgot-password', forgotPassword]] as const) {
      expect(metadata.alternates?.canonical).toBe(`/${route}`)
      expect(metadata.robots).toEqual({ index: false, follow: true, googleBot: { index: false, follow: true } })
      expect(paths).not.toContain(`/${route}`)
    }
  })

  it('defines the homepage canonical on the homepage, never on the shared root layout', () => {
    expect(new URL(home.alternates!.canonical as string).pathname).toBe('/')
    const rootLayout = readFileSync('app/layout.tsx', 'utf8')
    expect(rootLayout).not.toMatch(/canonical\s*:/)
  })
})
