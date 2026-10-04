import { marketingMetadata, jsonLd } from '@/lib/marketing/seo'
import { HomePageContent } from './_components/home-page'
import { serviceTrade } from '@/lib/marketing/trades'
import { siteUrl, plans } from '@/lib/marketing/site'

export const metadata = marketingMetadata({
  title: serviceTrade.id === 'hvac' ? 'HVAC Software for Small Service Businesses' : serviceTrade.name + ' Software for Service Businesses',
  description: 'Manage customers, jobs, estimates, invoices and online payments with FieldClose. Plans from $49/month. Explore the product tour or start a 14-day trial.',
  path: '/',
})

export default function HomePage() {
  return <>
    <HomePageContent statsBar={<section className="trust-bar" aria-label="FieldClose overview"><div className="shell"><span>Estimates to invoices</span><span>Connected customer records</span><span>Stripe-powered payments</span><span>Built for the field</span></div></section>} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'FieldClose',
      applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
      url: siteUrl, description: serviceTrade.description, offers: plans.map(plan => ({ '@type': 'Offer', name: plan.name + ' monthly subscription', price: plan.price, priceCurrency: 'USD', url: siteUrl + '/pricing', priceSpecification: { '@type': 'UnitPriceSpecification', price: plan.price, priceCurrency: 'USD', unitText: 'MONTH' } })),
    }) }} />
  </>
}
