// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BillingOverview, isAtRisk } from '@/app/settings/billing/billing-overview'
import type { Entitlements, UsageRow } from '@/lib/entitlements'

// next/link → plain anchor so it renders under jsdom.
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const activeEntitlements: Entitlements = {
  plan: 'PRO',
  status: 'ACTIVE',
  isReadOnly: false,
  readOnlyReason: null,
  trialEndsAt: null,
  trialDaysRemaining: null,
  trialExpired: false,
  hasStripeCustomer: true,
  limits: { maxUsers: 50, maxJobsPerMonth: 1000, maxActiveCustomers: 500 },
}

const expiredTrialEntitlements: Entitlements = {
  ...activeEntitlements,
  plan: 'STARTER',
  status: 'TRIALING',
  isReadOnly: true,
  readOnlyReason: 'trial_expired',
  trialEndsAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  trialDaysRemaining: 0,
  trialExpired: true,
  hasStripeCustomer: false,
  limits: { maxUsers: 5, maxJobsPerMonth: 100, maxActiveCustomers: 50 },
}

describe('BillingOverview', () => {
  it('renders the current plan and status', () => {
    render(<BillingOverview entitlements={activeEntitlements} usage={[]} />)
    expect(screen.getByTestId('plan-name')).toHaveTextContent('pro')
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Active')
    // Writable org → no read-only upsell.
    expect(screen.queryByTestId('readonly-upsell')).toBeNull()
    expect(screen.queryByTestId('readonly-badge')).toBeNull()
  })

  it('renders the trial-expired state for an expired trialing org', () => {
    render(<BillingOverview entitlements={expiredTrialEntitlements} usage={[]} />)
    expect(screen.getByTestId('trial-expired')).toHaveTextContent(/trial has expired/i)
    expect(screen.getByTestId('readonly-badge')).toHaveTextContent('Read-only')
    expect(screen.getByTestId('readonly-upsell')).toBeInTheDocument()
  })

  it('flags an over-cap usage row with the at-risk style and destructive used value', () => {
    const usage: UsageRow[] = [
      { limitKey: 'maxUsers', label: 'Team members', used: 5, cap: 5 }, // over cap
      { limitKey: 'maxJobsPerMonth', label: 'Jobs this month', used: 10, cap: 100 }, // healthy
      { limitKey: 'maxActiveCustomers', label: 'Active customers', used: 41, cap: 50 }, // 82% → at risk
    ]
    render(<BillingOverview entitlements={activeEntitlements} usage={usage} />)

    const usersRow = screen.getByTestId('usage-row-maxUsers')
    const jobsRow = screen.getByTestId('usage-row-maxJobsPerMonth')
    const customersRow = screen.getByTestId('usage-row-maxActiveCustomers')

    expect(usersRow).toHaveAttribute('data-over-cap', 'true')
    expect(usersRow).toHaveAttribute('data-at-risk', 'true')
    expect(jobsRow).toHaveAttribute('data-over-cap', 'false')
    expect(jobsRow).toHaveAttribute('data-at-risk', 'false')
    // 82% is at-risk but not over cap.
    expect(customersRow).toHaveAttribute('data-at-risk', 'true')
    expect(customersRow).toHaveAttribute('data-over-cap', 'false')
  })
})

describe('isAtRisk', () => {
  it('is true at 80%+ and false below', () => {
    expect(isAtRisk(8, 10)).toBe(true)
    expect(isAtRisk(10, 10)).toBe(true)
    expect(isAtRisk(7, 10)).toBe(false)
    expect(isAtRisk(0, 0)).toBe(false)
  })
})
