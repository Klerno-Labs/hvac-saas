import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reset password',
  description: 'Request a password reset link for your FieldClose account. Enter your account email, check your inbox, and follow the instructions to regain access.',
  alternates: { canonical: '/forgot-password' },
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
