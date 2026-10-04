import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import { SiteHeader, SiteFooter } from '@/app/(marketing)/_components/site-shell'
import HomePage from '@/app/(marketing)/page'
import PricingPage from '@/app/(marketing)/pricing/page'
import FaqPage from '@/app/(marketing)/faq/page'
import { plans, signupPath, productUrl } from '@/lib/marketing/site'
import { tradeProfiles } from '@/lib/marketing/trades'
import { TRADE_IDS } from '@/lib/trades'
import { PLANS } from '@/lib/billing'
import sitemap from '@/app/sitemap'

describe('integrated public website', () => {
  it('keeps auth and policy destinations on the current application origin', () => {
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, React.createElement(SiteHeader), React.createElement(SiteFooter)))
    expect(productUrl).toBe('')
    for (const href of ['/login', '/privacy', '/terms', '/pricing', '/faq']) expect(html).toContain(`href="${href}"`)
    expect(signupPath()).toBe('/signup?trade=hvac')
    expect(signupPath('pro')).toBe('/signup?trade=hvac&plan=pro')
    expect(html).not.toContain('app.fieldclose.app')
  })

  it('publishes the approved home with clearly labeled illustrative content', () => {
    const html = renderToStaticMarkup(React.createElement(HomePage))
    expect(html).toContain('Less paperwork.')
    expect(html).toContain('<h1>HVAC software.<br/>Less paperwork.</h1>')
    expect(html).toContain('Example invoice')
    expect(html).toContain('id="marketing-content"')
    expect(html).not.toContain('Lost to slow invoicing')
  })

  it('gets advertised prices from the actual application plan definitions', () => {
    expect(plans.map(plan => plan.price)).toEqual([PLANS.starter.priceMonthly / 100, PLANS.pro.priceMonthly / 100])
    const html = renderToStaticMarkup(React.createElement(PricingPage))
    expect(html).toContain('platform fees are separate')
    expect(html).toContain('Start free trial')
  })

  it('keeps FAQ content accessible without client JavaScript', () => {
    const html = renderToStaticMarkup(React.createElement(FaqPage))
    expect(html).toContain('<details>')
    expect(html).toContain('<summary>')
    expect(html).toContain('Can customers approve an estimate online?')
    expect(html).not.toContain('FAQPage')
  })

  it('scopes every marketing style so navigating to jobs or billing cannot alter the operational UI', () => {
    const css = readFileSync(path.join(process.cwd(), 'app/(marketing)/marketing.css'), 'utf8')
    const root = postcss.parse(css)
    root.walkRules(rule => {
      expect(rule.selectors.length).toBeGreaterThan(0)
      for (const selector of rule.selectors) expect(selector.startsWith('.fieldclose-marketing')).toBe(true)
    })
    root.walkAtRules(rule => expect(['import', 'theme']).not.toContain(rule.name))
  })

  it('keeps trade identifiers aligned with onboarding and includes new public routes in the sitemap', () => {
    expect(Object.keys(tradeProfiles).sort()).toEqual([...TRADE_IDS].sort())
    const paths = sitemap().map(entry => new URL(entry.url).pathname)
    expect(paths).toContain('/pricing')
    expect(paths).toContain('/faq')
    expect(paths).toContain('/privacy')
    expect(paths).toContain('/terms')
    expect(paths).toContain('/refund-policy')
    expect(paths).not.toContain('/signup')
  })
})
