import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create your FieldClose account to manage customers, estimates, jobs, invoices, and payments. Start a 14-day trial with no credit card required.',
  alternates: { canonical: '/signup' },
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
