import { afterAll, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const fixture = vi.hoisted(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', 'pegriollc@gmail.com')
  vi.stubEnv('STRIPE_STARTER_PRICE_ID', '')
  vi.stubEnv('STRIPE_BILLING_PORTAL_CONFIGURATION_ID', 'invalid')
  return { stripe: vi.fn() }
})
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/stripe', () => ({ getStripe: fixture.stripe }))
vi.mock('@/app/settings/billing/actions', () => ({ subscribe: vi.fn() }))
vi.mock('@/lib/session', () => ({ requireAuth: async () => ({
  organizationId: 'org-support-fixture', role: 'owner', user: { email: 'owner@example.test' },
  organization: { name: 'Example business', plan: 'STARTER', subscriptionStatus: 'TRIALING', trialEndsAt: null, stripeCustomerId: null },
}) }))

import { DEFAULT_SUPPORT_EMAIL, resolveSupportEmail, supportEmail, supportMailto } from '@/lib/support'
import { SiteFooter } from '@/app/(marketing)/_components/site-shell'
import FaqPage from '@/app/(marketing)/faq/page'
import HelpPage from '@/app/(marketing)/help/page'
import HelpArticlePage from '@/app/(marketing)/help/[slug]/page'
import PrivacyPage from '@/app/privacy/page'
import TermsPage from '@/app/terms/page'
import RefundPolicyPage from '@/app/refund-policy/page'
import BillingPage from '@/app/settings/billing/page'
import { helpArticles } from '@/lib/help/articles'
import { createSubscriptionCheckout } from '@/lib/billing'
import { POST } from '@/app/api/billing/portal/route'

afterAll(() => vi.unstubAllEnvs())

describe('public support configuration', () => {
  it.each([undefined, '', '   ', 'not-an-email', 'https://example.test', 'Name <help@example.test>',
    'one@example.test,two@example.test', 'help@example.test?bcc=other@example.test',
    'help@example.test\r\nBcc: other@example.test', `${'a'.repeat(250)}@example.test`,
  ])('uses the branded fallback for absent or invalid input %j', value => {
    expect(resolveSupportEmail(value)).toBe('support@fieldclose.app')
  })

  it('accepts a single valid public address and trims configuration whitespace', () => {
    expect(resolveSupportEmail('  help+fieldclose@example.test  ')).toBe('help+fieldclose@example.test')
    expect(supportEmail).toBe('pegriollc@gmail.com')
    expect(supportMailto()).toBe('mailto:pegriollc@gmail.com')
  })

  it('encodes a subject as one mail field without introducing recipients or headers', () => {
    const subject = 'Help & bcc=other@example.test\r\nExample #1'
    const url = new URL(supportMailto(subject))
    expect(url.pathname).toBe('pegriollc@gmail.com')
    expect([...url.searchParams]).toEqual([['subject', subject]])
    expect(url.hash).toBe('')
  })

  it('uses the configured destination in public, legal, help and trial-recovery rendering', async () => {
    const screens = [
      ...[SiteFooter, FaqPage, HelpPage, PrivacyPage, TermsPage, RefundPolicyPage].map(Component => React.createElement(Component)),
      await HelpArticlePage({ params: Promise.resolve({ slug: 'account-and-password' }) }),
      await BillingPage(),
    ]
    for (const screen of screens) {
      const html = renderToStaticMarkup(screen)
      const links = [...html.matchAll(/href="(mailto:[^"]+)"/g)].map(match => match[1])
      expect(links.length).toBeGreaterThan(0)
      expect(links.every(link => link.split('?')[0] === 'mailto:pegriollc@gmail.com')).toBe(true)
      expect(html).not.toContain(DEFAULT_SUPPORT_EMAIL)
    }
    const helpText = JSON.stringify(helpArticles)
    expect(helpText).toContain('Email pegriollc@gmail.com with your business name')
    expect(helpText).not.toContain(DEFAULT_SUPPORT_EMAIL)
  })

  it('directs blocked billing setup to the same address without contacting Stripe', async () => {
    const checkout = await createSubscriptionCheckout({ organizationId: 'org-support-fixture', planId: 'starter', userEmail: 'owner@example.test' })
    expect(checkout).toEqual({ error: 'Subscription checkout is not available yet. Contact support at pegriollc@gmail.com for help.' })
    const response = await POST()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Billing portal setup needs attention. Please contact support at pegriollc@gmail.com.' })
    expect(fixture.stripe).not.toHaveBeenCalled()
  })
})
