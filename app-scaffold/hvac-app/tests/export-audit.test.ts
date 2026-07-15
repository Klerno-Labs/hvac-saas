import { describe, it, expect, vi } from 'vitest'
import { flattenAuditLog, EXPORT_ENTITIES } from '@/lib/export'

vi.mock('@/lib/db', () => ({ db: {} }))

const BASE_LOG = {
  id: 'log_1',
  createdAt: new Date('2024-01-15T12:00:00Z'),
  eventType: 'stripe_connect_initiated',
  actorEmail: 'owner@example.com',
  targetType: 'Organization',
  targetId: 'org_abc',
  metadata: {},
}

describe('flattenAuditLog', () => {
  it('includes all required columns', () => {
    const row = flattenAuditLog(BASE_LOG)
    expect(row.id).toBe('log_1')
    expect(row.eventType).toBe('stripe_connect_initiated')
    expect(row.actorEmail).toBe('owner@example.com')
    expect(row.targetType).toBe('Organization')
    expect(row.targetId).toBe('org_abc')
    expect(typeof row.createdAt).toBe('string')
    expect('metadata' in row).toBe(true)
  })

  it('redacts sensitive metadata keys', () => {
    const row = flattenAuditLog({
      ...BASE_LOG,
      metadata: { token: 'sk_live_abc123', action: 'connected' },
    })
    const meta = JSON.parse(row.metadata as string)
    expect(meta.token).toBe('[REDACTED]')
    expect(meta.action).toBe('connected')
  })

  it('serializes metadata to a JSON string', () => {
    const row = flattenAuditLog({ ...BASE_LOG, metadata: { action: 'done' } })
    expect(typeof row.metadata).toBe('string')
    expect(() => JSON.parse(row.metadata as string)).not.toThrow()
  })

  it('handles null metadata safely', () => {
    const row = flattenAuditLog({ ...BASE_LOG, metadata: null })
    expect(row.metadata).toBe('{}')
  })

  it('serializes createdAt as ISO string', () => {
    const row = flattenAuditLog(BASE_LOG)
    expect(row.createdAt).toBe('2024-01-15T12:00:00.000Z')
  })
})

describe('EXPORT_ENTITIES', () => {
  it('includes audit', () => {
    expect(EXPORT_ENTITIES).toContain('audit')
  })

  it('includes the standard business entities', () => {
    expect(EXPORT_ENTITIES).toContain('customers')
    expect(EXPORT_ENTITIES).toContain('jobs')
    expect(EXPORT_ENTITIES).toContain('invoices')
    expect(EXPORT_ENTITIES).toContain('payments')
  })
})
