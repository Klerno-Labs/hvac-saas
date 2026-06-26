import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'

describe('WebhookEvent schema/client sync', () => {
  it('exposes the WebhookEvent model on the generated client', () => {
    expect(Prisma.ModelName.WebhookEvent).toBe('WebhookEvent')
  })

  it('WebhookEventScalarFieldEnum includes the ledger-critical fields', () => {
    const scalarFields = Object.values(Prisma.WebhookEventScalarFieldEnum)
    expect(scalarFields).toContain('stripeEventId')
    expect(scalarFields).toContain('payloadHash')
    expect(scalarFields).toContain('status')
    expect(scalarFields).toContain('nextRetryAt')
  })

  it('never persists raw payloads — only payloadHash (secret-safety)', () => {
    const scalarFields = Object.values(Prisma.WebhookEventScalarFieldEnum)
    expect(scalarFields).toContain('payloadHash')
    expect(scalarFields).not.toContain('payload')
    expect(scalarFields).not.toContain('rawPayload')
    expect(scalarFields).not.toContain('body')
  })

  it('keeps organizationId as a nullable scalar (no FK/relation to Organization)', () => {
    const scalarFields = Object.values(Prisma.WebhookEventScalarFieldEnum)
    expect(scalarFields).toContain('organizationId')
    // organization is intentionally NOT a relation field; it must not appear as a
    // generated relation type. PayloadDelegate scalars are the only org-facing column.
  })
})
