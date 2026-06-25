import './globals.css'
import type { Metadata } from 'next'
import { Providers } from './providers'
import { NavHeader } from './components/nav-header'
import { BillingBannerWrapper } from './components/billing-banner-wrapper'
import { Analytics } from '@vercel/analytics/react'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const SITE_URL = process.env.APP_URL || 'https://fieldclose.app'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'FieldClose — Get Paid Faster on Every HVAC Job',
    template: '%s · FieldClose',
  },
  description: 'The quote-to-payment operating system for residential HVAC businesses. Send estimates, complete jobs, invoice customers, and collect payment — all in one workflow.',
  applicationName: 'FieldClose',
  keywords: [
    'HVAC software',
    'HVAC invoicing',
    'HVAC estimates',
    'field service management',
    'HVAC CRM',
    'HVAC quote to payment',
    'contractor software',
    'HVAC payments',
    'HVAC collections',
    'small business HVAC',
  ],
  authors: [{ name: 'FieldClose' }],
  creator: 'FieldClose',
  publisher: 'FieldClose',
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'FieldClose',
    title: 'FieldClose — Get Paid Faster on Every HVAC Job',
    description: 'The quote-to-payment operating system for residential HVAC businesses. Estimates, invoices, payments, and collections in one workflow.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'FieldClose — Get Paid Faster on Every HVAC Job',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FieldClose — Get Paid Faster on Every HVAC Job',
    description: 'The quote-to-payment operating system for residential HVAC businesses.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  alternates: { canonical: SITE_URL },
  category: 'business software',
  verification: {
    google: 'SRi7UiAJOXVpe8bFWXO4ufcDfSY6YtTht7GC-wcwoPk',
    other: {
      'msvalidate.01': '86C439B0183EE3B27344DCE5D0FCE723',
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f766e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <Providers>
          <NavHeader />
          <BillingBannerWrapper />
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
