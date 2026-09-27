# Next steps after integration verification

Use [current release gates](known-issues.md), [launch evidence](launch-verification-2026-09-27.md), and [payment verification](stripe-runtime-verification.md). Older unpromoted-candidate, unavailable-database and pending-owner-signup notes have been superseded.

## Completed release

Application `06b5b7b` is published at `fieldclose.app` on `dpl_npJvDDwFEywEHGLKE2bAtCg6Sf16`. Unit, PostgreSQL, build and full GitHub CI checks passed; actual sandbox customer Checkout and simulated Terminal cancellation/capture matched signed events, local ledger and provider records. Final public routes and metadata checks passed. Scheduled services are enabled, tied to this deployment, and passed authenticated zero-work checks.

Keep the unavailable original database's recovery trail. Continue periodic production backup and restore verification; a new workspace did not recover the old records.

## First real customer operation

- A business owner must complete their own live Stripe connection. Sandbox onboarding and payments do not satisfy live account readiness or first-payment evidence. Any real charge requires the customer's authorized purchase; no real charge was part of this verification.
- Monitor payment reconciliation, delivery failures, support, uptime and scheduled execution. The designated support inbox receives critical alerts, but someone still must act on exceptions.
- Confirm actual scheduled invocation and missed-run/outage notification behavior. An authenticated route check does not prove future calendar execution.
- Keep SMS, direct accounting integrations and optional AI claims aligned with the configured product. SMS and OpenAI remain unconfigured; accounting currently uses CSV exports.
- Run a limited operator pilot before trade expansion or buying traffic. Measure account activation, completed jobs/payments, support requests and retention. No acquisition campaign or advertising budget was launched.

## Growth and product improvements

Prioritize from measured failures: deposits and partial-balance reconciliation, self-service refunds, direct accounting connections and specialized trade workflows. Public self-service pages reduce routine sales/support work; they cannot guarantee growth or eliminate incident handling. Custom funnel events remain disabled on the current Hobby analytics plan until eligible service and explicit activation are arranged.
