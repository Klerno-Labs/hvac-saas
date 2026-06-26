import { describe, it, expect } from 'vitest'
import { buildJobCompleteEmailBody } from '@/lib/email'
import { buildJobCompleteSmsText } from '@/lib/sms'

const BASE = {
  customerName: 'Jane Smith',
  orgName: 'Cool HVAC',
  jobTitle: 'AC Tune-Up',
}

describe('buildJobCompleteEmailBody', () => {
  it('includes outstanding balance line when outstandingFormatted and payUrl are present', () => {
    const body = buildJobCompleteEmailBody({
      ...BASE,
      outstandingFormatted: '$150.00',
      payUrl: 'https://example.com/pay',
    })
    expect(body).toContain('$150.00')
    expect(body).toContain('balance')
  })

  it('does not include balance line when outstandingFormatted is absent', () => {
    const body = buildJobCompleteEmailBody({
      ...BASE,
      reviewUrl: 'https://example.com/review',
    })
    expect(body).not.toContain('balance')
    expect(body).not.toContain('$')
  })

  it('includes review link when no outstanding balance', () => {
    const body = buildJobCompleteEmailBody({
      ...BASE,
      reviewUrl: 'https://example.com/review',
    })
    expect(body).toContain('https://example.com/review')
  })

  it('does not include review link when outstanding balance is present', () => {
    const body = buildJobCompleteEmailBody({
      ...BASE,
      outstandingFormatted: '$50.00',
      payUrl: 'https://example.com/pay',
      reviewUrl: 'https://example.com/review',
    })
    expect(body).not.toContain('https://example.com/review')
  })

  it('includes workSummary when provided', () => {
    const body = buildJobCompleteEmailBody({
      ...BASE,
      workSummary: 'Replaced the air filter and cleaned coils.',
    })
    expect(body).toContain('Replaced the air filter and cleaned coils.')
  })

  it('omits workSummary section when not provided', () => {
    const body = buildJobCompleteEmailBody({ ...BASE })
    expect(body).not.toContain('Replaced')
  })

  it('escapes HTML in customer-supplied fields', () => {
    const body = buildJobCompleteEmailBody({
      customerName: '<script>alert(1)</script>',
      orgName: 'A&B HVAC',
      jobTitle: 'AC "Tune-Up"',
    })
    expect(body).not.toContain('<script>')
    expect(body).toContain('&lt;script&gt;')
    expect(body).toContain('&amp;')
  })
})

describe('buildJobCompleteSmsText', () => {
  it('includes pay balance and payUrl when both are present', () => {
    const text = buildJobCompleteSmsText({
      ...BASE,
      outstandingFormatted: '$150.00',
      payUrl: 'https://example.com/pay',
    })
    expect(text).toContain('$150.00')
    expect(text).toContain('https://example.com/pay')
  })

  it('does not include pay content when outstandingFormatted is absent', () => {
    const text = buildJobCompleteSmsText({
      ...BASE,
      payUrl: 'https://example.com/pay',
    })
    expect(text).not.toContain('balance')
    expect(text).not.toContain('$')
  })

  it('includes review URL when no outstanding balance', () => {
    const text = buildJobCompleteSmsText({
      ...BASE,
      reviewUrl: 'https://example.com/review',
    })
    expect(text).toContain('https://example.com/review')
    expect(text).not.toContain('balance')
  })

  it('does not include review URL when outstanding balance takes priority', () => {
    const text = buildJobCompleteSmsText({
      ...BASE,
      outstandingFormatted: '$50.00',
      payUrl: 'https://example.com/pay',
      reviewUrl: 'https://example.com/review',
    })
    expect(text).not.toContain('https://example.com/review')
  })

  it('produces a complete message with no trailing URL when neither pay nor review is set', () => {
    const text = buildJobCompleteSmsText({ ...BASE })
    expect(text).toContain('AC Tune-Up')
    expect(text).toContain('complete')
  })
})
