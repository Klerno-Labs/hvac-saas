import type { Metadata } from 'next'
import { SiteHeader, SiteFooter } from './_components/site-shell'
import { serviceTrade } from '@/lib/marketing/trades'
import { siteUrl } from '@/lib/marketing/site'
import './marketing.css'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'FieldClose — Less paperwork. More paid work.', template: '%s · FieldClose' },
  description: serviceTrade.description,
  keywords: [...serviceTrade.keywords],
  openGraph: {
    type: 'website', siteName: 'FieldClose', url: siteUrl,
    title: 'FieldClose — Less paperwork. More paid work.',
    description: serviceTrade.description,
    images: [{ url: '/social-image', width: 1200, height: 630, alt: 'FieldClose — Less paperwork. More paid work.' }],
  },
  twitter: {
    card: 'summary_large_image', title: 'FieldClose — Less paperwork. More paid work.',
    description: serviceTrade.description, images: ['/social-image'],
  },
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="fieldclose-marketing">
    <a className="skip-link" href="#marketing-content">Skip to page content</a>
    <SiteHeader />
    {children}
    <SiteFooter />
  </div>
}
