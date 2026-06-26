import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'

describe('WebhookEvent Prisma model', () => {
  it('is registered in Prisma.ModelName', () => {
    expect(Prisma.ModelName.WebhookEvent).toBe('WebhookEvent')
  })

  it('exposes required scalar fields in WebhookEventScalarFieldEnum', () => {
    const fields = Prisma.WebhookEventScalarFieldEnum
    expect(fields.stripeEventId).toBe('stripeEventId')
    expect(fields.payloadHash).toBe('payloadHash')
    expect(fields.status).toBe('status')
    expect(fields.nextRetryAt).toBe('nextRetryAt')
  })
})
