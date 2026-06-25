import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import {
  canWriteFromClaims,
  type EntitlementSnapshot,
} from '@/lib/entitlements-claims'

/**
 * Production hardening + entitlements middleware.
 *
 * Responsibilities (kept deliberately lean):
 *  - Add security headers to all responses
 *  - Edge-safe read-only enforcement: for mutating API requests
 *    (POST/PUT/PATCH/DELETE) made by an authenticated but READ-ONLY org,
 *    return 403 `{ error: 'read_only', reason }`. Read navigations (GET) are
 *    NEVER blocked so a read-only org can still browse and reach billing.
 *
 * The JWT carries a compact entitlement snapshot (populated at sign-in by the
 * NextAuth `jwt` callback). Middleware reads it via `getToken` — pure JWT
 * decode, no database, so it runs cleanly on the edge runtime. The
 * AUTHORITATIVE enforcement lives in the server-action guard
 * (`assertCanWrite`), which re-queries the DB; this middleware is a coarse
 * fast-path that catches read-only orgs early on mutating API calls.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * API routes that are NOT user-org-scoped and therefore must never be gated by
 * org entitlements: NextAuth flow, Stripe webhook (signature-verified), cron
 * routes (shared-secret), internal bridges (no user session), and public data.
 */
const UNGATED_API_PREFIXES = [
  '/api/auth',
  '/api/stripe/webhook',
  '/api/collections/run',
  '/api/recurring/generate',
  '/api/internal',
  '/api/public',
]

function isUngatedApi(pathname: string): boolean {
  return UNGATED_API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

export type WriteGateInput = {
  method: string
  pathname: string
  snapshot: EntitlementSnapshot | null
}

export type WriteGateDecision =
  | { blocked: false }
  | { blocked: true; status: 403; body: { error: 'read_only'; reason: string } }

/**
 * Pure decision function extracted for testability. Returns a 403 decision only
 * for a mutating, org-scoped API call made by a read-only org. Everything else
 * (GETs, ungated system routes, requests with no snapshot, active orgs) passes.
 */
export function evaluateWriteGate(input: WriteGateInput): WriteGateDecision {
  const isMutatingApi =
    input.pathname.startsWith('/api/') &&
    MUTATING_METHODS.has(input.method.toUpperCase()) &&
    !isUngatedApi(input.pathname)

  if (!isMutatingApi) return { blocked: false }

  const decision = canWriteFromClaims(input.snapshot)
  if (!decision.ok) {
    return { blocked: true, status: 403, body: { error: 'read_only', reason: decision.reason } }
  }

  return { blocked: false }
}

function applySecurityHeaders(
  response: NextResponse,
  pathname: string,
): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.delete('X-Powered-By')
  if (pathname.startsWith('/api/')) {
    response.headers.set('X-Content-Type-Options', 'nosniff')
  }
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const snapshot: EntitlementSnapshot | null = await resolveSnapshot(request)

  const decision = evaluateWriteGate({
    method: request.method,
    pathname,
    snapshot,
  })

  if (decision.blocked) {
    return applySecurityHeaders(
      NextResponse.json(decision.body, { status: decision.status }),
      pathname,
    )
  }

  return applySecurityHeaders(NextResponse.next(), pathname)
}

/**
 * Decode the JWT entitlement snapshot (edge-safe). Returns null when there is
 * no session or the token predates the entitlement snapshot — in both cases
 * `evaluateWriteGate` treats the request as non-blocked and defers to the
 * authoritative server-action guard.
 */
async function resolveSnapshot(
  request: NextRequest,
): Promise<EntitlementSnapshot | null> {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  })

  if (
    !token ||
    !token.organizationId ||
    !token.plan ||
    !token.subscriptionStatus
  ) {
    return null
  }

  return {
    organizationId: token.organizationId,
    plan: token.plan,
    subscriptionStatus: token.subscriptionStatus,
    trialEndsAt: token.trialEndsAt ?? null,
  }
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
