import {
  canWrite,
  checkLimit,
  type LimitKey,
  type PlanId,
  type WriteReason,
} from '@/lib/entitlements'

/**
 * Typed errors raised by the entitlement guards. Server actions convert these
 * into their existing `{ success: false; error }` return shape via
 * `handleGuardError` so the UI can show an upsell instead of receiving a 500.
 */
export class ReadOnlyError extends Error {
  reason: WriteReason
  constructor(reason: WriteReason) {
    super('read_only')
    this.name = 'ReadOnlyError'
    this.reason = reason
  }
}

export class PlanLimitError extends Error {
  limit: LimitKey
  used: number
  cap: number
  plan: PlanId
  constructor(limit: LimitKey, used: number, cap: number, plan: PlanId) {
    super('plan_limit')
    this.name = 'PlanLimitError'
    this.limit = limit
    this.used = used
    this.cap = cap
    this.plan = plan
  }
}

/**
 * Throw `ReadOnlyError` unless the org is allowed to write (active subscription
 * or within trial). Fail CLOSED — `canWrite` resolves read-only on any lookup
 * error, so this will throw and the caller must surface a structured error.
 */
export async function assertCanWrite(orgId: string): Promise<void> {
  const decision = await canWrite(orgId)
  if (!decision.ok) {
    throw new ReadOnlyError(decision.reason)
  }
}

/**
 * Throw `PlanLimitError` if the org is at/over the plan cap for `limit`.
 */
export async function assertWithinLimit(
  orgId: string,
  limit: LimitKey,
): Promise<void> {
  const decision = await checkLimit(orgId, limit)
  if (!decision.ok) {
    throw new PlanLimitError(limit, decision.used, decision.limit, decision.plan)
  }
}

/**
 * Convert a guard error into a server-action return value matching the repo's
 * `{ success: false; error: string }` convention. Returns `null` for non-guard
 * errors so callers can rethrow unexpected failures untouched.
 *
 * Usage in a server action:
 *   try { await assertCanWrite(orgId); await assertWithinLimit(orgId, 'maxJobsPerMonth') }
 *   catch (e) { const r = handleGuardError(e); if (r) return r; throw e }
 */
export function handleGuardError(
  error: unknown,
): { success: false; error: 'read_only' | 'plan_limit' } | null {
  if (error instanceof ReadOnlyError) return { success: false, error: 'read_only' }
  if (error instanceof PlanLimitError) return { success: false, error: 'plan_limit' }
  return null
}

/**
 * Convert a guard error into a JSON-friendly shape for route handlers.
 * Returns `null` for non-guard errors.
 */
export function guardErrorToJson(
  error: unknown,
): { error: 'read_only' | 'plan_limit'; reason?: string } | null {
  if (error instanceof ReadOnlyError) {
    return { error: 'read_only', reason: error.reason }
  }
  if (error instanceof PlanLimitError) {
    return {
      error: 'plan_limit',
      reason: `${error.limit} (${error.used}/${error.cap})`,
    }
  }
  return null
}
