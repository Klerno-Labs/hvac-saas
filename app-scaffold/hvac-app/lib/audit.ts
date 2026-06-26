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

const SENSITIVE_KEYS = new Set([
  'password', 'secret', 'token', 'apiKey', 'api_key',
  'access_token', 'refresh_token', 'stripe_secret',
  'webhook_secret', 'hashedPassword',
])

export function sanitizeMetadata(obj: Record<string, unknown>): Record<string, unknown> {
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
