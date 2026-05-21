# AGENTS.md

## Project
HVAC SaaS — a multi-tenant vertical AI SaaS for residential HVAC quote-to-payment workflows.

## Stack
- Next.js 15 App Router
- TypeScript
- Prisma + PostgreSQL
- Auth.js (next-auth v5) with Credentials + GitHub providers
- Stripe Connect for payments
- Zod for validation
- OpenAI (optional) for AI estimate drafting

## Key conventions
- Multi-tenant: every query scoped by `organizationId` derived server-side
- Auth: `requireAuth()` from `lib/session.ts` for protected pages, `auth()` + membership lookup for server actions
- Admin: `requireAdmin()` from `lib/require-admin.ts` for sensitive settings actions (checks `role === 'owner'`)
- Validation: Zod schemas in `lib/validations/`
- Events: `trackEvent()` from `lib/events.ts` for product activity
- Audit: `logAudit()` from `lib/audit.ts` for security/admin events (separate from activity events)
- Payment truth: webhook-confirmed only, never from client redirects
- Portal: token-based customer access via `validatePortalToken()` from `lib/portal.ts`

## App structure
- `app/` — Next.js App Router pages and server actions
- `lib/` — shared utilities (db, auth, events, audit, stripe, ai, validations, portal, collections, accounting-sync, env)
- `prisma/schema.prisma` — single schema file for all models
- `docs/` — product specs, checklists, deployment guide

## Working directory
All app code is in `app-scaffold/hvac-app/`. Run `npm` commands from there.

## Build
```bash
cd app-scaffold/hvac-app
npm install
npm run build
```

## Current state
Features 1-11 implemented. See `docs/known-issues.md` for launch blockers and deferred items.
