import { auth } from '@/lib/auth'

export type PlatformAdminResult =
  | { authorized: true; email: string }
  | { authorized: false; error: string }

/**
 * Gate for platform-operator tools that are NOT organization-scoped — e.g. the
 * Stripe webhook dead-letter queue, which can contain ANY tenant's failed
 * payment events plus platform-level events (account.updated, subscriptions).
 *
 * The existing `requireAdmin()` (org owner) cannot be used here: it would let
 * every tenant owner read every other tenant's payment failures, which is a
 * cross-tenant data leak. There is no platform-superadmin role in the schema,
 * so authorization is via an env-based email allowlist. This keeps the change
 * minimal (no new DB-backed role model) while preserving tenant isolation.
 *
 * Configure via `PLATFORM_ADMIN_EMAILS` (comma-separated, case-insensitive).
 * When unset, every caller is refused — fail closed.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminResult> {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase().trim()
  if (!email) {
    return { authorized: false, error: 'You must be logged in' }
  }

  const allowlist = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  if (allowlist.length === 0) {
    return { authorized: false, error: 'Platform admin access is not configured' }
  }
  if (!allowlist.includes(email)) {
    return { authorized: false, error: 'You are not a platform admin' }
  }
  return { authorized: true, email }
}
