import { describe, it, expect } from 'vitest'
import { buildJobCompleteEmailBody } from '@/lib/email'
import { buildJobCompleteSmsText } from '@/lib/sms'

const BASE = {
  customerName: 'Jane Doe',
  orgName: 'Cool HVAC Co',
  jobTitle: 'AC Tune-Up',
}

describe('buildJobCompleteEmailBody', () => {
  it('includes job title and customer name', () => {
    const html = buildJobCompleteEmailBody(BASE)
    expect(html).toContain('Jane Doe')
    expect(html).toContain('AC Tune-Up')
    expect(html).toContain('Cool HVAC Co')
  })

  it('includes workSummary when provided', () => {
    const html = buildJobCompleteEmailBody({ ...BASE, workSummary: 'Replaced filter and cleaned coils.' })
    expect(html).toContain('Replaced filter and cleaned coils.')
  })

  it('omits workSummary section when absent', () => {
    const html = buildJobCompleteEmailBody(BASE)
    expect(html).not.toContain('Replaced filter')
  })

  it('shows balance line and pay CTA context when outstandingFormatted+payUrl are present', () => {
    const html = buildJobCompleteEmailBody({
      ...BASE,
      outstandingFormatted: '$125.00',
      payUrl: 'https://example.com/portal/abc',
    })
    expect(html).toContain('$125.00')
    expect(html).toContain('balance')
  })

  it('does not show balance line when outstandingFormatted is absent', () => {
    const html = buildJobCompleteEmailBody({ ...BASE, payUrl: 'https://example.com/portal/abc' })
    expect(html).not.toContain('balance')
  })

  it('does not show balance line when payUrl is absent', () => {
    const html = buildJobCompleteEmailBody({ ...BASE, outstandingFormatted: '$50.00' })
    expect(html).not.toContain('balance')
  })

  it('escapes HTML special characters in user-supplied strings', () => {
    const html = buildJobCompleteEmailBody({
      ...BASE,
      customerName: '<script>alert(1)</script>',
      workSummary: 'Fixed A&B',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A&amp;B')
  })
})

describe('buildJobCompleteSmsText', () => {
  it('includes job title and org name', () => {
    const text = buildJobCompleteSmsText(BASE)
    expect(text).toContain('AC Tune-Up')
    expect(text).toContain('Cool HVAC Co')
  })

  it('shows pay CTA when outstandingFormatted+payUrl are present', () => {
    const text = buildJobCompleteSmsText({
      ...BASE,
      outstandingFormatted: '$75.00',
      payUrl: 'https://example.com/portal/xyz',
    })
    expect(text).toContain('$75.00')
    expect(text).toContain('https://example.com/portal/xyz')
    expect(text).toContain('Pay your balance')
  })

  it('shows review CTA when no outstanding balance', () => {
    const text = buildJobCompleteSmsText({
      ...BASE,
      reviewUrl: 'https://example.com/reviews/tok123',
    })
    expect(text).toContain('https://example.com/reviews/tok123')
    expect(text).toContain('Leave a review')
  })

  it('shows pay CTA even when reviewUrl is also present', () => {
    const text = buildJobCompleteSmsText({
      ...BASE,
      outstandingFormatted: '$50.00',
      payUrl: 'https://example.com/portal/abc',
      reviewUrl: 'https://example.com/reviews/tok',
    })
    expect(text).toContain('Pay your balance')
    expect(text).not.toContain('Leave a review')
  })

  it('returns base message when neither payUrl+outstanding nor reviewUrl are set', () => {
    const text = buildJobCompleteSmsText(BASE)
    expect(text).not.toContain('Pay your balance')
    expect(text).not.toContain('Leave a review')
  })
})
