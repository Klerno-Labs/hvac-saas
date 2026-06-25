// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReadOnlyBanner } from '@/components/billing/read-only-banner'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('ReadOnlyBanner', () => {
  it('renders a persistent message with a reactivate link for a frozen org', () => {
    render(<ReadOnlyBanner reason="trial_expired" show />)
    const banner = screen.getByTestId('read-only-banner')
    expect(banner).toHaveTextContent(/your account is read-only/i)
    expect(banner).toHaveTextContent(/your trial has expired/i)
    const link = screen.getByRole('link', { name: /reactivate to continue/i })
    expect(link).toHaveAttribute('href', '/settings/billing')
  })

  it('renders nothing for a writable org', () => {
    const { container } = render(<ReadOnlyBanner show={false} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByTestId('read-only-banner')).toBeNull()
  })
})
