import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to FieldClose to manage your customers, jobs, estimates, invoices, and payments. Access your account or request help resetting your password.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
