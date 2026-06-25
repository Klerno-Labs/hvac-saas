import { describe, it, expect, beforeEach, vi } from 'vitest'

// --- Mocks -----------------------------------------------------------------

const db = vi.hoisted(() => ({
  organization: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db }))

const sendEmail = vi.fn()
vi.mock('@/lib/email', () => ({ sendEmail }))
vi.mock('@/lib/email-template', () => ({ renderEmail: ({ title }: { title: string }) => `<html>${title}</html>` }))

const { sendDunningEmail, clearDunningState } = await import('@/lib/dunning')

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APP_URL = 'http://localhost:3000'
  // Prisma's update() returns a Promise; mocks must too (dunning.ts chains .catch()).
  db.organization.update.mockResolvedValue({})
})

describe('sendDunningEmail — per-invoice idempotency', () => {
  it('sends once for an invoice and records the idempotency marker', async () => {
    db.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'Acme',
      email: 'a@b.co',
      dunningLastSentInvoiceId: null,
      dunningAttempt: 0,
    })
    sendEmail.mockResolvedValue({ success: true, id: 're_1' })

    const result = await sendDunningEmail({ orgId: 'org_1', invoiceId: 'in_1' })

    expect(result).toEqual({ sent: true, attempt: 1 })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(db.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: expect.objectContaining({
        dunningLastSentInvoiceId: 'in_1',
        dunningAttempt: 1,
        dunningLastSentAt: expect.any(Date),
      }),
    })
  })

  it('does NOT re-send for the same invoice (per-invoice idempotency)', async () => {
    db.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'Acme',
      email: 'a@b.co',
      dunningLastSentInvoiceId: 'in_1', // already sent for this invoice
      dunningAttempt: 1,
    })

    const result = await sendDunningEmail({ orgId: 'org_1', invoiceId: 'in_1' })

    expect(result).toEqual({ sent: false, reason: 'already-sent-for-invoice' })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(db.organization.update).not.toHaveBeenCalled()
  })

  it('sends again for a DIFFERENT invoice (new billing period failure)', async () => {
    db.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'Acme',
      email: 'a@b.co',
      dunningLastSentInvoiceId: 'in_1',
      dunningAttempt: 1,
    })
    sendEmail.mockResolvedValue({ success: true, id: 're_2' })

    const result = await sendDunningEmail({ orgId: 'org_1', invoiceId: 'in_2' })

    expect(result).toEqual({ sent: true, attempt: 2 })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('skips silently when the org has no billing email (degrade, no crash)', async () => {
    db.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'Acme',
      email: null,
      dunningLastSentInvoiceId: null,
      dunningAttempt: 0,
    })
    const result = await sendDunningEmail({ orgId: 'org_1', invoiceId: 'in_1' })
    expect(result).toEqual({ sent: false, reason: 'no-billing-email' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('does not throw when sendEmail fails (degrade-and-alert)', async () => {
    db.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'Acme',
      email: 'a@b.co',
      dunningLastSentInvoiceId: null,
      dunningAttempt: 0,
    })
    sendEmail.mockResolvedValue({ success: false, error: 'RESEND_API_KEY missing' })

    const result = await sendDunningEmail({ orgId: 'org_1', invoiceId: 'in_1' })
    expect(result).toEqual({ sent: false, reason: 'send-failed' })
    // Idempotency marker must NOT be persisted when send failed, so retries can re-attempt.
    expect(db.organization.update).not.toHaveBeenCalled()
  })
})

describe('clearDunningState', () => {
  it('resets all dunning fields on recovery', async () => {
    await clearDunningState('org_1')
    expect(db.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: {
        dunningLastSentInvoiceId: null,
        dunningAttempt: 0,
        dunningLastSentAt: null,
      },
    })
  })
})
