// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ManageBillingButton } from '@/app/settings/billing/manage-billing-button'

describe('ManageBillingButton', () => {
  let assignSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    assignSpy = vi.fn()
    // jsdom's window.location.assign isn't reliably spyable; stub it.
    Object.defineProperty(window, 'location', {
      value: { assign: assignSpy, href: '' },
      writable: true,
    })
    vi.restoreAllMocks()
  })

  it('POSTs to /api/billing/portal and navigates to the returned url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://billing.stripe.com/portal_abc' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ManageBillingButton />)
    fireEvent.click(screen.getByText('Manage billing'))

    await waitFor(() => expect(assignSpy).toHaveBeenCalledTimes(1))

    expect(fetchMock).toHaveBeenCalledWith('/api/billing/portal', { method: 'POST' })
    expect(assignSpy).toHaveBeenCalledWith('https://billing.stripe.com/portal_abc')
    // No error surfaced on success.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows an inline error and re-enables when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Stripe is down' }),
      }),
    )

    render(<ManageBillingButton />)
    fireEvent.click(screen.getByText('Manage billing'))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Stripe is down'))
    expect(assignSpy).not.toHaveBeenCalled()
    // Button is interactive again.
    expect(screen.getByText('Manage billing')).not.toBeDisabled()
  })
})
