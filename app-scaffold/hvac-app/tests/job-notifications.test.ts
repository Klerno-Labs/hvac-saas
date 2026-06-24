import { describe, it, expect } from 'vitest'
import {
  buildJobCompletionEmail,
  buildJobCompletionSms,
  formatCents,
  type JobCompletionMessageContext,
} from '@/lib/job-notifications'

const baseCtx: JobCompletionMessageContext = {
  customerName: 'Jane Doe',
  orgName: 'Acme HVAC',
  jobTitle: 'Furnace tune-up',
  workSummary: 'Replaced filter, checked burners, system running normally.',
  technicianName: 'Pat',
  hasOpenInvoice: true,
  outstandingFormatted: '$189.00',
  payUrl: 'https://example.test/portal/abc',
  reviewUrl: 'https://example.test/reviews/def',
}

describe('formatCents', () => {
  it('formats cents into a dollar string', () => {
    expect(formatCents(18900)).toBe('$189.00')
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(105)).toBe('$1.05')
  })
})

describe('buildJobCompletionEmail', () => {
  it('includes org name and job title in the subject', () => {
    const { subject } = buildJobCompletionEmail(baseCtx)
    expect(subject).toContain('Acme HVAC')
    expect(subject).toContain('Furnace tune-up')
  })

  it('includes the work summary, pay link, and review link in the body', () => {
    const { html } = buildJobCompletionEmail(baseCtx)
    expect(html).toContain('Replaced filter')
    expect(html).toContain('$189.00')
    expect(html).toContain('https://example.test/portal/abc')
    expect(html).toContain('https://example.test/reviews/def')
  })

  it('uses the pay CTA when there is an open invoice', () => {
    const { html } = buildJobCompletionEmail(baseCtx)
    expect(html).toContain('View &amp; Pay Invoice')
  })

  it('omits the pay block and uses the review CTA when there is no open invoice', () => {
    const { html, subject } = buildJobCompletionEmail({
      ...baseCtx,
      hasOpenInvoice: false,
      outstandingFormatted: undefined,
      payUrl: undefined,
    })
    expect(html).not.toContain('$189.00')
    expect(html).not.toContain('/portal/abc')
    expect(html).toContain('Leave a Review')
    expect(html).toContain('/reviews/def')
    // Subject has no amount when nothing is due
    expect(subject).not.toContain('$')
  })

  it('omits the summary block when there is no work summary', () => {
    const { html } = buildJobCompletionEmail({ ...baseCtx, workSummary: '' })
    expect(html).not.toContain('Work completed')
    // still delivers pay + review
    expect(html).toContain('/portal/abc')
    expect(html).toContain('/reviews/def')
  })

  it('escapes HTML in user-controlled fields', () => {
    const { html } = buildJobCompletionEmail({
      ...baseCtx,
      workSummary: '<script>alert(1)</script>',
      customerName: 'A & B <co>',
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B')
  })
})

describe('buildJobCompletionSms', () => {
  it('includes org, job title, pay link, and review link', () => {
    const body = buildJobCompletionSms(baseCtx)
    expect(body).toContain('Acme HVAC')
    expect(body).toContain('Furnace tune-up')
    expect(body).toContain('$189.00')
    expect(body).toContain('/portal/abc')
    expect(body).toContain('/reviews/def')
  })

  it('omits the pay segment when there is no open invoice', () => {
    const body = buildJobCompletionSms({
      ...baseCtx,
      hasOpenInvoice: false,
      outstandingFormatted: undefined,
      payUrl: undefined,
    })
    expect(body).not.toContain('$189.00')
    expect(body).not.toContain('/portal/abc')
    expect(body).toContain('/reviews/def')
  })
})
