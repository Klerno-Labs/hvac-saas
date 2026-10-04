# FieldClose release checklist

Current local verification and remaining commercial/operating gates are recorded in [the September 27 hardening report](evidence/release-hardening-2026-09-27/report.md). Earlier evidence is retained in `readiness-2026-09-26.md`. The boxes below are production release gates, not claims that these services have been exercised.

## Deployment and recovery

- [ ] Confirm which host serves the marketing site and which serves the application. The existing app uses fieldclose.app; verify a separate application origin before moving marketing to the root.
- [ ] Configure canonical origins, HTTPS, authentication secret, database connection and allowed callback URLs. Keep credentials out of source control.
- [ ] Rehearse all migrations on a representative sanitized production copy, including `0005_reconcile_product_schema` and `0006_estimate_invoice_link`.
- [ ] Demonstrate database backup restoration and a compatible application rollback.
- [ ] Run unit/integration tests, typecheck, production build and dependency audit in CI.
- [ ] Verify monitoring, alert ownership and support contacts. `/api/health` must reflect actual readiness; do not silence failures.

## First complete customer journey

- [ ] Signup → trade selection → organization → customer → scheduled/assigned job.
- [ ] Price an estimate explicitly, send to an authorized test recipient, approve from a phone, and create the linked draft invoice.
- [ ] Verify scope, quantity, prices, tax and customer information before sending. Repeated conversion must open the same invoice.
- [ ] Confirm email success/failure states and explicit resend behavior.
- [ ] Test decline, invalid/expired/revoked portal tokens and keyboard-only approval.
- [ ] Confirm draft estimates and invoices cannot be downloaded through customer tokens.
- [ ] Confirm a technician can see their assigned work and customer-facing documents but cannot access unrelated jobs, cost catalogs, invitation tokens, billing controls or organization-wide financial reports.
- [ ] Test invitation acceptance, wrong-account rejection, password reset, staff removal and session behavior on representative devices.

## Payment and subscription truth

- [ ] In Stripe test mode, validate Connect onboarding, account capability changes, configured prices, fees and billing portal recovery.
- [ ] Verify signed webhook delivery for Checkout, PaymentIntent, subscription and connected-account events used by the configured endpoints.
- [ ] Confirm a completed but unpaid asynchronous checkout does not mark an invoice paid. Only a confirmed, matching payment can do so.
- [ ] Exercise successful payment, delayed success/failure, repeated/out-of-order delivery and webhook retry after a transient database failure.
- [ ] Verify amount, currency, account and organization mismatches remain unsettled and alert an operator.
- [ ] Test card collection through Terminal with real supported test hardware if enabled.
- [ ] Validate trial expiry, canceled subscription replacement, read-only organizations, and recovery through owner billing settings.
- [ ] Confirm payment redirects and manual staff edits cannot mark invoices paid; paid/void documents cannot be reopened.

## Field operations and trade pilots

- [ ] Verify uploads with configured private storage and authorized test files.
- [ ] Test recurring generation, membership pause, month-end dates and scheduled execution in the deployed environment.
- [ ] Verify inventory use and insufficient-stock feedback during simultaneous real-device work.
- [ ] Test offline disconnect/reconnect, retries, logout and account switching before advertising offline completeness.
- [ ] Verify SMS/email delivery, appointment reminders and collections schedules with authorized recipients.
- [ ] Confirm business summaries match a known dataset, including more than ten invoices and due-today dates.
- [ ] Run representative HVAC operator tasks and record completion/errors/time before broad release; repeat for each new trade.

## Explicit product boundaries

- Real QuickBooks/Xero sync is unavailable; CSV export is the supported handoff. Do not advertise an integration as complete.
- Estimates with deposits or existing payments cannot automatically convert until those amounts can be reconciled safely. Partial balances also need a deliberate checkout/reconciliation flow.
- Shared trade profiles do not certify specialized permits, chemical/treatment logs, refrigerant logs, inspection forms or trade regulations.
- Verify privacy, retention, refund, security and support promises against implemented operations and vendor configuration before release.
- Do not claim enterprise feature parity, load capacity, uptime, a quality percentile or superior business outcomes without supporting evidence.
