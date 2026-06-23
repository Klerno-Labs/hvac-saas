import { describe, it, expect } from 'vitest'
import {
  getTerminalEligibility,
  resolveCollectAmountCents,
  isInvoiceCollectable,
  buildTerminalPaymentIntentParams,
  computeApplicationFeeCents,
  TERMINAL_PAYMENT_METHOD,
} from '@/lib/terminal'

const fullyConfigured = {
  stripeConnectedAccountId: 'acct_123',
  stripeChargesEnabled: true,
  stripeTerminalEnabled: true,
}

describe('getTerminalEligibility', () => {
  it('is eligible when connect, charges, and terminal flag are all set', () => {
    expect(getTerminalEligibility(fullyConfigured)).toEqual({ eligible: true })
  })

  it('is not eligible without a connected account', () => {
    const r = getTerminalEligibility({ ...fullyConfigured, stripeConnectedAccountId: null })
    expect(r.eligible).toBe(false)
    expect(r.reason).toMatch(/not set up/i)
  })

  it('is not eligible when charges are not enabled', () => {
    const r = getTerminalEligibility({ ...fullyConfigured, stripeChargesEnabled: false })
    expect(r.eligible).toBe(false)
    expect(r.reason).toMatch(/charges are not enabled/i)
  })

  it('is not eligible when the terminal flag is off (graceful gate)', () => {
    const r = getTerminalEligibility({ ...fullyConfigured, stripeTerminalEnabled: false })
    expect(r.eligible).toBe(false)
    expect(r.reason).toMatch(/terminal/i)
  })
})

describe('resolveCollectAmountCents', () => {
  const base = { outstandingCents: 5000, totalCents: 5000, status: 'sent' }

  it('returns outstanding amount for a sent invoice', () => {
    expect(resolveCollectAmountCents(base)).toBe(5000)
  })

  it('falls back to total when outstanding is zero', () => {
    expect(resolveCollectAmountCents({ ...base, outstandingCents: 0, totalCents: 7500 })).toBe(7500)
  })

  it('returns null for paid invoices', () => {
    expect(resolveCollectAmountCents({ ...base, status: 'paid' })).toBeNull()
  })

  it('returns null for void invoices', () => {
    expect(resolveCollectAmountCents({ ...base, status: 'void' })).toBeNull()
  })

  it('returns null for draft invoices (must be sent first)', () => {
    expect(resolveCollectAmountCents({ ...base, status: 'draft' })).toBeNull()
  })

  it('returns null when amount is zero or negative', () => {
    expect(resolveCollectAmountCents({ outstandingCents: 0, totalCents: 0, status: 'sent' })).toBeNull()
    expect(resolveCollectAmountCents({ outstandingCents: -1, totalCents: -1, status: 'sent' })).toBeNull()
  })

  it('prefers outstanding over total when partial payment exists', () => {
    expect(resolveCollectAmountCents({ outstandingCents: 2000, totalCents: 5000, status: 'sent' })).toBe(2000)
  })
})

describe('isInvoiceCollectable', () => {
  it('matches resolveCollectAmountCents nullability', () => {
    expect(isInvoiceCollectable({ outstandingCents: 5000, totalCents: 5000, status: 'sent' })).toBe(true)
    expect(isInvoiceCollectable({ outstandingCents: 5000, totalCents: 5000, status: 'paid' })).toBe(false)
    expect(isInvoiceCollectable({ outstandingCents: 0, totalCents: 0, status: 'sent' })).toBe(false)
  })
})

describe('buildTerminalPaymentIntentParams', () => {
  it('builds a manual-capture card_present intent with terminal metadata', () => {
    const params = buildTerminalPaymentIntentParams({
      invoiceId: 'inv_1',
      organizationId: 'org_1',
      invoiceNumber: 'INV-100',
      amountCents: 12500,
      feePercent: 2.9,
    })

    expect(params.amount).toBe(12500)
    expect(params.currency).toBe('usd')
    expect(params.payment_method_types).toEqual(['card_present'])
    expect(params.capture_method).toBe('manual')
    expect(params.metadata?.method).toBe(TERMINAL_PAYMENT_METHOD)
    expect(params.metadata?.invoiceId).toBe('inv_1')
    expect(params.metadata?.organizationId).toBe('org_1')
    expect(params.metadata?.invoiceNumber).toBe('INV-100')
    expect(params.description).toBe('Invoice #INV-100')
  })

  it('computes the platform application fee from feePercent', () => {
    const params = buildTerminalPaymentIntentParams({
      invoiceId: 'inv_1',
      organizationId: 'org_1',
      invoiceNumber: 'INV-100',
      amountCents: 10000,
      feePercent: 2.9,
    })
    expect(params.application_fee_amount).toBe(290)
  })

  it('omits application_fee_amount when fee computes to zero', () => {
    const params = buildTerminalPaymentIntentParams({
      invoiceId: 'inv_1',
      organizationId: 'org_1',
      invoiceNumber: 'INV-100',
      amountCents: 10000,
      feePercent: 0,
    })
    expect(params.application_fee_amount).toBeUndefined()
  })
})

describe('computeApplicationFeeCents', () => {
  it('rounds to the nearest cent', () => {
    expect(computeApplicationFeeCents(12500, 2.9)).toBe(363)
  })

  it('never returns a negative fee', () => {
    expect(computeApplicationFeeCents(0, 2.9)).toBe(0)
  })
})
