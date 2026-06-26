import { describe, it, expect } from 'vitest'
import { flattenAuditLog, EXPORT_ENTITIES } from '@/lib/export'

const BASE_ROW = {
  id: 'audit-1',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  eventType: 'settings_changed',
  actorEmail: 'owner@example.com',
  targetType: 'organization',
  targetId: 'org-1',
  metadata: { plan: 'pro' },
}

describe('flattenAuditLog', () => {
  it('includes all required columns', () => {
    const row = flattenAuditLog(BASE_ROW)
    expect(row).toHaveProperty('id', 'audit-1')
    expect(row).toHaveProperty('createdAt')
    expect(row).toHaveProperty('eventType', 'settings_changed')
    expect(row).toHaveProperty('actorEmail', 'owner@example.com')
    expect(row).toHaveProperty('targetType', 'organization')
    expect(row).toHaveProperty('targetId', 'org-1')
    expect(row).toHaveProperty('metadata')
  })

  it('serializes metadata to a string', () => {
    const row = flattenAuditLog(BASE_ROW)
    expect(typeof row.metadata).toBe('string')
  })

  it('redacts sensitive keys in metadata', () => {
    const row = flattenAuditLog({
      ...BASE_ROW,
      metadata: { plan: 'pro', secret: 'super-secret', token: 'abc123', password: 'hunter2' },
    })
    const meta = JSON.parse(row.metadata)
    expect(meta.plan).toBe('pro')
    expect(meta.secret).toBe('[REDACTED]')
    expect(meta.token).toBe('[REDACTED]')
    expect(meta.password).toBe('[REDACTED]')
  })

  it('handles null optional fields gracefully', () => {
    const row = flattenAuditLog({ ...BASE_ROW, actorEmail: null, targetType: null, targetId: null, metadata: null })
    expect(row.actorEmail).toBe('')
    expect(row.targetType).toBe('')
    expect(row.targetId).toBe('')
    expect(row.metadata).toBe('{}')
  })
})

describe('EXPORT_ENTITIES', () => {
  it('includes audit', () => {
    expect(EXPORT_ENTITIES).toContain('audit')
  })

  it('includes the core data entities', () => {
    expect(EXPORT_ENTITIES).toContain('customers')
    expect(EXPORT_ENTITIES).toContain('jobs')
    expect(EXPORT_ENTITIES).toContain('invoices')
    expect(EXPORT_ENTITIES).toContain('payments')
  })
})
