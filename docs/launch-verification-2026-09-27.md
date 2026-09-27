# Launch verification — September 27, 2026

This records a bounded local verification checkpoint for application revision `beae275e67a1ec823922fc1310670ab13052d10f`. Publication, provider delivery and financial settlement require their own evidence. Later Terminal and invoice follow-ups are outside this checkpoint and require final verification before deployment.

## Corrections included

- Portal capabilities reject deleted customers, inconsistent customer/organization ownership, malformed tokens and expiry at the current instant. Link issuance verifies current customer ownership; owners can still revoke historical links.
- Estimate/invoice and invitation actions distinguish explicit rejection from uncertain email submission. An activity-log failure after email acceptance no longer encourages a duplicate send; logs omit provider errors and private links.
- Scheduled work requires exactly `SCHEDULED_TASKS_ENABLED=true`. Missing, false or malformed values remain paused. Appointment reminders exclude drafts and recheck current state under a lock. Genuine scheduled failures and partial outcomes report fixed, privacy-safe diagnostics when monitoring is configured.
- Connect account creation explicitly requests card-payment and transfer capabilities, uses a stable provider idempotency key and conditionally saves the account without replacing a concurrent winner. Secondary telemetry failure does not turn a saved provider setup into a failed setup result.

## Verified locally

The combined suite passed **1,284 unit tests** and **103 PostgreSQL integration tests**, type checking and a production build. Integration tests used disposable loopback PostgreSQL, not the production database.

An earlier isolated production build, `gA_yUfXvBhEnhDyE1mDQT`, passed 23 real-authentication HTTP checks at 13:58 UTC. After the final Connect telemetry correction, the complete set passed again against revision `beae275`, build **`eDcgWHILerkWZr854y2aj`**, at **14:19:35 UTC**. The repeat used a separate application copy, database `fieldclose_access_final_e2e_test` and port 3307, leaving the sandbox payment listener and its fixtures untouched.

The 23 checks used normal Auth.js CSRF/credentials sign-in and the actual compiled routes, with synthetic passwords held in memory. They verified:

- Owner multipart upload and persisted, exact image bytes with private/no-store, no-referrer and noindex headers.
- Assigned-technician access; denial for an unassigned technician, another organization and an anonymous request for the same asset; unauthorized uploads creating no asset.
- Valid customer-token access and denial for another customer, mismatched organization, expired/revoked tokens and a deleted customer, including the shared portal page.
- A missing private object returning 503 and successful retrieval after restoration.
- The actual password-reset server action changing the password and invalidating sibling tokens; the old authenticated session losing photo access, token replay failing, and fresh sign-in succeeding with the new password.

These runs used private local file storage, not R2, and made no email, payment or other provider requests. Fixture users, organizations, assets and reset tokens were removed, and the test server stopped. Sanitized receipts remain locally at `/tmp/fieldclose-release/local-access-verification.json` and `/tmp/fieldclose-release/local-access-final-verification.json`; fixture passwords and cookies are absent from them.

## Remaining evidence at this checkpoint

These checks do not establish hosted cross-tenant behavior, R2 failure handling, reset-email delivery, provider-originated payment settlement or future scheduled invocation. Earlier production owner upload/anonymous denial and owner-reported recovery are recorded separately in [email and photo verification](email-and-photo-storage.md). The sandbox payment run, authorized document/reminder deliveries and the next deployment must be recorded separately with their exact outcomes. No real charge, customer campaign or new operational guarantee follows from these local results.

## Subsequent production document delivery

On the canonical `beae275` release, the authorized operator used the normal document status forms to send **one internal-test estimate (EST-0001)** and **one zero-balance internal-test invoice (INV-0001)** to the approved `pegriollc@gmail.com` verification inbox. Resend timestamps are **14:16:43.374 UTC** and **14:16:55.945 UTC**, respectively. The bounded provider check at **14:17:54 UTC** found exactly one matching message for each and reported both **delivered**. Neither message was resent. Their provider IDs are `01a0e339-add2-73b0-8502-9ec76b3b0f27` (estimate) and `01a0e339-dee1-718c-87cf-3c42931ea0ff` (invoice); the sanitized receipt is `/tmp/fieldclose-document-email-receipts.json`.

The actual emailed portal link rendered the intended two documents. Internal staff notes were absent from the message and portal content. This exposed a zero-balance presentation defect: payment language remained visible despite no collectible balance. The later source correction and its local rendering tests are separate from these already delivered messages; final hosted verification of that correction is still required. Invitation delivery was not tested or forced past Starter's one-seat limit. See [document delivery evidence](email-and-photo-storage.md).

## Controlled production reminder and duplicate suppression

Production project settings changed only `SCHEDULED_TASKS_ENABLED` from `false` to `true` at **14:17:15 UTC**. The resulting **unpromoted** candidate was `dpl_gswtgoVEQ9v1g8f7P1ovFJJuWDmQ`, application `beae275`, at `https://fieldclose-3x6nzbsnm-hatfield-legacy-trusts-projects.vercel.app`. Both the public alias and Vercel's scheduled deployment remained on `dpl_Cm2JaHVU8KdKKojZUdUgdXJGkzWu`. An authenticated public reminder request at **14:20:22 UTC** returned **503 / Scheduled tasks are paused**, confirming that the new project setting had not activated the existing public release.

The bounded candidate check created exactly one separate job, `fieldclose_internal_reminder_verification_20260927`, titled **INTERNAL TEST — appointment reminder verification**, for September 28 in the business's `America/Chicago` calendar. Guards verified the fixed internal customer, the approved inbox, an active workspace, disabled SMS, and no other eligible appointment, collections or recurring work. No existing job or document was modified.

- The first authenticated reminder request returned **sent: 1, errors: 0**. The database recorded one email-only reminder event and `appointmentReminderSentAt=2026-09-27T14:21:36.101Z`.
- An intentional repeat returned **sent: 0, errors: 0**, with the same single event and timestamp.
- Resend's read-only metadata showed exactly one matching email, ID `01a0e33e-2815-71d7-8fb2-4a2a3e1ffad7`, created **14:21:36.862 UTC**, with status **delivered**. This verifies recipient mail-server acceptance; independent Gmail inbox visibility was not recorded by this check.
- The new job was returned to **Draft, no scheduled date** at **14:21:52 UTC**, retaining delivery evidence. The original job's recorded state hash was unchanged.
- After cleanup, all three authenticated candidate routes returned **200**, `success: true`, `Cache-Control: no-store`, and zero work/errors: appointment reminders, collections, and recurring generation. No SMS was attempted.

Private, sanitized receipts are in `/tmp/fieldclose-release`: `scheduler-environment-enabled.json`, `enabled-scheduler-candidate.json`, `public-scheduler-remains-paused.json`, `controlled-reminder-dispatch-2026-09-27T14-21-40-523Z.json`, `controlled-reminder-cleanup-2026-09-27T14-21-52-270Z.json`, `controlled-reminder-delivery-2026-09-27T14-21-57-254Z.json`, and `controlled-reminder-zero-2026-09-27T14-22-46-541Z.json`. These establish actual route execution and one email delivery, not future calendar invocation, missed-run detection or operator response. This candidate was not promoted by the verification agent.

## Completed sandbox financial workflows

The separate `fc-complete-20260927-1` run used Stripe sandbox account `acct_1TMx2eBqF8hjPLwn`, its restricted runtime credential, and synthetic organizations in an isolated local database. It did not access the production application database or charge real money.

- Hosted **Starter $49/month** and **Pro $99/month** Checkouts completed. Stripe reported paid sessions, active subscriptions and matching organization/plan metadata. Signed subscription events reconciled the respective local plans. Both subscriptions were subsequently canceled at period end through the hosted portal; provider reads confirmed `cancel_at_period_end=true`.
- Hosted synthetic Connect onboarding produced active card-payment and transfer capabilities on test merchant `acct_1UK8h6BEDgDA9wtd`.
- A **$125 connected-account invoice** Checkout completed with payment intent `pi_3UKIuxBEDgDA9wtd1Y6paHEE`. The original signature-verified event `evt_1UKIuzBEDgDA9wtdo1Djzeqn` returned 200 and produced one succeeded local payment, invoice status **paid**, and **zero outstanding**. A browser return URL was not accepted as settlement evidence.
- Concurrent Pro subscription event `evt_1UKImHBqF8hjPLwn1eKfVDWK` initially returned the intended retryable 500 after the billing snapshot changed. An explicit provider-read replay and its duplicate both returned 200, with one durable processed event and unchanged financial state. These replays are distinguished from the original signature-verified delivery.

Evidence resides in `stripe-sandbox-readonly-proof.json`, `stripe-completed-sandbox.json`, `stripe-event-e2e.json`, and `stripe-event-e2e-v2.json` under `/tmp/fieldclose-release`. The original Stripe CLI verified signatures; the local relay then forwarded exact event payloads using separate local signing secrets. The sandbox listener emitted `2026-03-25.dahlia` events; live destinations remain pinned to `2025-02-24.acacia`. The connected-payment replay checker initially applied an inappropriate billing-event-table assertion; its HTTP response succeeded, but corrected ledger-level duplicate verification must be recorded separately.

**Terminal collection/capture, physical reader behavior, the final combined revision and final deployment are not certified by this append.** No final-suite totals are added here. Sandbox completion does not establish live charges, refunds, disputes or bank payouts.
