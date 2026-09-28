import type { Metadata } from 'next'
import { HomePageContent } from './_components/home-page'
import { serviceTrade } from '@/lib/marketing/trades'
import { siteUrl } from '@/lib/marketing/site'

export const metadata: Metadata = {
  title: { absolute: 'FieldClose — Less paperwork. More paid work.' },
  description: serviceTrade.description,
  alternates: { canonical: siteUrl },
}

export default function HomePage() {
  return <>
    <HomePageContent statsBar={<section className="trust-bar" aria-label="FieldClose overview"><div className="shell"><span>Estimates to invoices</span><span>Connected customer records</span><span>Stripe-powered payments</span><span>Built for the field</span></div></section>} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'FieldClose',
      applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
      url: siteUrl, description: serviceTrade.description,
    }).replace(/</g, '\\u003c') }} />
  </>
}
