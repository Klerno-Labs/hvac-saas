# Self-service Help Center

The public `/help` route provides local search and topic filters over eight static guides. Visitors do not need an account to read them. Search does not send queries to an external provider. All guides remain present in the initial server-rendered page, and each article has its own title, description, canonical URL, table of contents, related articles, and application links.

The portable content is in `app-scaffold/hvac-app/lib/help/articles.ts`. Search is in `lib/help/search.ts`. The public pages and their scoped CSS module are under `app/(marketing)/help`. Only registered slugs are pre-rendered; unknown article routes return 404.

Guides cover business setup, customer and price-book imports, team roles, estimates and approval, invoices and payment processing, subscription management, field work, account recovery, and accounting exports. Content describes the implemented limits: full-invoice portal payment, deposits requiring reconciliation, partial offline text queues, online-only photos and signatures, summary exports, and unavailable direct QuickBooks/Xero sync. Plan prices are linked to the shared Pricing/Billing screens rather than copied into the articles. Support contact is asynchronous email without a promised response time.

## Invitation email recovery

Team invitation creation now distinguishes a saved invitation from successful email submission. A provider rejection or exception produces a visible delivery warning, retains the pending invitation, and offers the owner a **Resend invitation** action. Retry uses the stored recipient, role, token, and expiry; it does not create a second invitation or renew an accepted, expired, or revoked invitation. No private invitation token is returned to the owner UI or logged on delivery failure.

Creation serializes duplicate and seat checks on the organization row. Owner authorization, active-workspace checks, and Starter seat limits apply before sending. The UI captures its form before awaiting the action and recovers from network failures. This does not promise inbox delivery or exactly-once external email: provider acceptance and recipient receipt are different, and an explicit resend may produce another email for the same invitation.

## Public-page availability

The root navigation and trial-banner wrappers tolerate failures only in optional session decoration. An authenticated visitor can still read public Help pages when the membership database or session verification is unavailable; the optional header falls back to a neutral role and the trial banner is omitted. Private page guards (`requireAuth`, `requireActiveSubscription`, and `requirePageCapability`) are unchanged and still fail closed. Next.js redirect, not-found, and dynamic-render control errors are rethrown so the framework retains its normal behavior. A connection failure must still return before that fallback can render; this change does not remove database timeout latency.

## Focused verification

- `tests/help-center.test.ts`: 18 tests for search ranking and filters, safe slugs, actual application destinations, material feature limits, metadata/static params, server-rendered article links, empty results, article anchors, and 404 handling.
- `tests/team-invitation-delivery.test.ts`: 14 tests for reported delivery failure, secret-free failure logging, accepted delivery, pending-invitation reuse, owner/plan checks, inactive-workspace rejection, persistence failure, scoped resend, accepted/expired/missing invitation rejection, and accessible pending-only resend controls. All email delivery is mocked.
- `tests/optional-shell-session.test.ts`: 12 tests for working/anonymous/failed optional session decoration, preserving framework control flow, and unchanged failures in private access guards.

Run these with `npx vitest run tests/help-center.test.ts tests/team-invitation-delivery.test.ts tests/optional-shell-session.test.ts` from the application directory. These checks cover local behavior; live email configuration, real payment settlement, and database/service availability require deployment verification.
