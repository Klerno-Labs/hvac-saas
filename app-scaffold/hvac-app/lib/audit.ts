import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

type AuditInput = {
  organizationId: string
  actorId?: string
  actorEmail?: string
  eventType: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

/**
 * Write an append-only audit log entry for a security or admin-relevant event.
 * Audit logs are organization-scoped and not user-editable.
 *
 * Never include secrets, tokens, passwords, or raw payment payloads in metadata.
 */
export async function logAudit(input: AuditInput) {
  // Sanitize metadata — strip any keys that could contain secrets
  const safeMetadata = input.metadata ? sanitizeMetadata(input.metadata) : undefined

  return db.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      eventType: input.eventType,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: safeMetadata as Prisma.InputJsonValue | undefined,
      ipAddress: input.ipAddress ?? null,
    },
  })
}

/**
 * A scalar value safe to store in AuditLog.metadata. Non-scalars are reduced
 * to a bounded summary so the append-only log cannot grow unboundedly from a
 * single mutation (e.g. a 10KB notes field).
 */
export type DiffValue = string | number | boolean | null

/**
 * Compute a field-level diff between a `before` snapshot and an `after`
 * snapshot, suitable for embedding in AuditLog.metadata as a "diff summary".
 *
 * Semantics:
 *  - The set of keys compared is the union of `after`'s own keys and any keys
 *    passed in `include`. Keys present only in `before` are ignored (they are
 *    not being mutated). This lets callers pass the full DB row as `before`
 *    and only the edited fields as `after`.
 *  - Only keys whose normalized value actually differs are returned.
 *  - Dates become ISO strings; undefined/null collapse to null; strings longer
 *    than 200 chars are truncated; arrays/objects become a shape summary.
 */
export function summarizeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  include?: readonly string[],
): Record<string, { from: DiffValue; to: DiffValue }> {
  const keys = new Set<string>(Object.keys(after))
  if (include) for (const k of include) keys.add(k)

  const diff: Record<string, { from: DiffValue; to: DiffValue }> = {}
  for (const key of keys) {
    const from = toDiffValue(before[key])
    const to = toDiffValue(after[key])
    if (from === to) continue
    diff[key] = { from, to }
  }
  return diff
}

function toDiffValue(v: unknown): DiffValue {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    return v.length > 200 ? v.slice(0, 197) + '...' : v
  }
  if (Array.isArray(v)) return `[${v.length} items]`
  if (typeof v === 'object') return `{${Object.keys(v).length} keys}`
  return String(v)
}

const SENSITIVE_KEYS = new Set([
  'password', 'secret', 'token', 'apiKey', 'api_key',
  'access_token', 'refresh_token', 'stripe_secret',
  'webhook_secret', 'hashedPassword',
])

function sanitizeMetadata(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]'
    } else {
      result[key] = value
    }
  }
  return result
}
