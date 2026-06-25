import type Stripe from 'stripe'

/**
 * Stripe event fixtures for billing-webhook tests. No live keys — these build
 * in-memory Stripe.Event-shaped objects. The webhook only reads a handful of
 * fields off each object, so we keep the fixtures minimal but correctly typed.
 */

export function makeEvent(
  type: string,
  object: Record<string, unknown>,
  id = 'evt_test_123',
): Stripe.Event {
  return {
    id,
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: 1700000000,
    type,
    livemode: false,
    pending_webhooks: 0,
    request: { id: 'req_test', idempotency_key: null },
    data: { object: object as never },
  } as unknown as Stripe.Event
}

export function makeSubscription(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'sub_test_1',
    object: 'subscription',
    status: 'active',
    customer: 'cus_test_1',
    current_period_end: 1893456000,
    metadata: { organizationId: 'org_test_1', planId: 'STARTER' },
    ...overrides,
  }
}

export function makeInvoice(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'in_test_1',
    object: 'invoice',
    customer: 'cus_test_1',
    subscription: 'sub_test_1',
    status: 'open',
    ...overrides,
  }
}

/** A Prisma-shaped unique-constraint violation (P2002), as thrown by @prisma/client. */
export function prismaUniqueViolation(subject = 'stripeEventId'): unknown {
  return Object.assign(new Error('Unique constraint failed'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target: [subject] },
  })
}
