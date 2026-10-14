# Production readiness work — 2026-09-26

This branch contains local reliability and security fixes, not a release certification. The full cross-repository competitor review and visual evidence live in `Klerno-Labs/fieldclose-web`, `docs/readiness-review.md`, on the corresponding `codex/production-readiness` branch.

## Verified locally

644 unit tests (67 files), 53 PostgreSQL integration tests (9 files), typechecking and the production build passed. Dependency audit found zero known vulnerabilities in the installed tree. All ten migrations applied to a dedicated test database; Prisma reported zero schema drift. A legacy Pro/active/customer-ID fixture survived migration. Synthetic-user browser checks covered sign-in, dashboard, job, estimate creation and customer estimate review.

## Operational changes to account for

- `0005_reconcile_product_schema` is required for the current product schema. Back up and rehearse against representative sanitized production data first. Unknown legacy billing values deliberately stop the migration for investigation.
- Payments become paid only through a signed, validated Stripe webhook. Enable `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.succeeded` and the existing billing/connect events appropriate to the configured endpoint. Confirm connected-account event delivery and signing secrets in Stripe test mode.
- Invoice settlement requires USD and the exact outstanding amount, matched organization and connected account. Reconciliation errors return 500 for retry and require operational investigation; they must not be silently acknowledged.
- Billing processing retrieves the current subscription, writes its event claim and state in one transaction, and returns failures for retry. Canceled subscription replacement requires matching organization metadata.
- The customer portal does not create a second checkout if the previous session completed or cannot be verified. Adjusted/partial balances are blocked from full-total checkout pending a deliberate partial-payment implementation.
- Staff cannot manually mark invoices paid. Paid/void invoices and finalized estimates cannot be reopened. Invoice voiding first expires any open hosted checkout.
- Accounting sync is unavailable. Prior fake success paths were removed; owners can use CSV exports.
- Private pages are no longer cached by the service worker. Analytics only runs on selected marketing pages and strips query/hash values.

## Integration tests

Use a dedicated PostgreSQL database whose name ends in `_test`; tests deliberately create/delete fixtures. Never point these tests at production.

```sh
npm ci
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npm test -- --run
npm run test:integration
npm run typecheck
npm run build
```

`TEST_DATABASE_URL` must be explicitly provided for the integration command. CI provisions its own PostgreSQL service.

## Release gates

Verify production routing: the live application was at `https://fieldclose.app`; `app.fieldclose.app` did not resolve during review. Do not overwrite application routes with the standalone marketing deployment.

Before release: validate real Stripe test-mode lifecycle and delayed payment failures; authorized email/SMS delivery; uploads; scheduled jobs; backup restoration; monitoring and rollback. Verify role/tenant behavior with representative accounts and devices; offline/account-switching and large-data workflow coverage remains necessary. Review legal/retention promises against actual implementation. Accounting integration and enterprise feature parity remain incomplete and must not be advertised as working.

## Expanded workflow and trade readiness

- Shared visual system now extends into navigation, controls, dashboard, invoice list and business reports; mobile navigation exposes permitted destinations.
- Business summaries aggregate every receivable, including beyond the ten-item display list. Confirmed USD collections use a defined 30-day window; due-today invoices are not overdue. Report definitions distinguish gross payments from accounting income.
- Accepted estimates create one linked draft invoice with preserved line items and tax, even under concurrent conversion. See `estimate-to-invoice.md`.
- Customer decisions are atomic and support a typed signature; delivery failures remain visible with resend guidance.
- Authenticated mutation checks cover capabilities, subscription and read-only organizations. Assigned technicians retain customer-facing documents for their work while unrelated records and administrative controls are restricted.
- Inventory decrement and usage are atomic; concurrent recurring generation cannot duplicate the same due visit. Month-end recurrence remains in its intended month.
- Validated trade profiles cover HVAC, plumbing, electrical, pest control and general service; owner changes are audited, onboarding retries are idempotent, and AI drafts enforce unpriced lines. See `trade-profiles.md`.
- Settings no longer passes invitation tokens or integration controls to nonowners. Email templates escape dynamic values and restrict action-link schemes.

Synthetic browser evidence in the marketing repository includes typed customer approval, accepted estimate → $125 draft invoice, returning to the same invoice, mobile settings trade changes, financial reports and responsive dashboards. No real customer received a message and no payment was collected.

## Account entry and credential rollout

Invitations now require the recipient's signed-in email and preserve their destination through signup/login. Acceptance is atomic and respects workspace/seat boundaries. Password-reset tokens are stored as digests, consumed once transactionally, and revoke sibling links and prior sessions after a password change. Reset requests expose global delivery unavailability without revealing account existence.

The new credential-version session check intentionally invalidates pre-change sessions at rollout. Existing users must sign in again. Rehearse this transition, password recovery delivery and OAuth on staging before deployment. Invitation and authentication callback responses carry no-store/no-referrer/noindex protections.

## Document output check

The synthetic $125 invoice downloaded as a one-page PDF. Its rendered layout, customer, scope, line quantity, subtotal, tax and total were inspected. With email unconfigured, marking the synthetic invoice sent displayed a clear delivery-failed warning and an explicit retry path; no customer email was transmitted.

## Scheduling and reporting dates

Existing jobs are scheduled by calendar date, not appointment time. Field, job views, Calendar and reminder copy now preserve that date; the organization's validated time zone chooses today/tomorrow. Financial due-date aging uses the same business-day helper and has a midnight-boundary regression test. See `calendar-dates.md`. Dashboard work prioritizes in-progress work, including undated jobs, and its payment-setup action appears only to the owner.

## Final verification

Final combined checks on 2026-09-26: 644 unit tests, 53 real-database integration tests, typecheck, production build and diff checks passed. All ten migrations are current with no schema drift; dependency audit reported zero known vulnerabilities. Fresh browser sign-ins verified owner navigation and technician assigned-work restrictions, restricted settings and blocked financial reports. Core health responds 200/no-store while accurately reporting optional unconfigured integrations.

CSV exports neutralize formula strings without changing numeric cents, and explicitly reject oversized results rather than silently truncating. Reminder concurrency and provider failure handling are tested; see `auth-entry-hardening.md` for the remaining external delivery guarantees.

No production deploy or migration was performed. Local preview services bind only to loopback and use synthetic disposable data.

Owner browser export verification downloaded exactly one synthetic invoice row: INV-0001, sent, totalCents 12500, matching the $125 screen and PDF. Final visual polish also labels field-note inputs for assistive technology and handles singular metric counts.
