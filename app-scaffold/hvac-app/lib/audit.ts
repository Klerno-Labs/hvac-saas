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

// All entries stored lowercase; comparison uses .toLowerCase()
const SENSITIVE_KEYS = new Set([
  'password', 'secret', 'token', 'apikey', 'api_key',
  'access_token', 'refresh_token', 'stripe_secret',
  'webhook_secret', 'hashedpassword',
])

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase())
}

function sanitizeMetadata(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key] = isSensitiveKey(key) ? '[REDACTED]' : value
  }
  return result
}

function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

export function diffSummary(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  opts?: { fields?: string[] },
): { field: string; from: unknown; to: unknown }[] {
  if (before === null && after === null) return []

  const b = before ?? {}
  const a = after ?? {}
  const candidates = opts?.fields ?? [...new Set([...Object.keys(b), ...Object.keys(a)])]

  const result: { field: string; from: unknown; to: unknown }[] = []

  for (const key of candidates) {
    let from: unknown
    let to: unknown

    if (before === null) {
      if (!(key in a)) continue
      from = null
      to = a[key]
    } else if (after === null) {
      if (!(key in b)) continue
      from = b[key]
      to = null
    } else {
      from = b[key]
      to = a[key]
      if (isEqual(from, to)) continue
    }

    result.push({
      field: key,
      from: isSensitiveKey(key) ? '[REDACTED]' : from,
      to: isSensitiveKey(key) ? '[REDACTED]' : to,
    })
  }

  return result
}

export async function logMutation(input: {
  organizationId: string
  actorId?: string
  actorEmail?: string
  action: string
  entityType: string
  entityId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  ipAddress?: string
}) {
  const changes = diffSummary(input.before ?? null, input.after ?? null)
  const summary = changes
    .slice(0, 3)
    .map(c => `${c.field}: ${String(c.from)}→${String(c.to)}`)
    .join(', ')

  return logAudit({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    eventType: input.action,
    targetType: input.entityType,
    targetId: input.entityId,
    metadata: { changes, summary },
    ipAddress: input.ipAddress,
  })
}
