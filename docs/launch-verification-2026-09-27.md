# Launch verification — September 27, 2026

This records successive verification checkpoints. The initial local checkpoint covers application revision `beae275e67a1ec823922fc1310670ab13052d10f`; the final automated checks below cover `06b5b7b74caaf965115f60cf36884314c4c90935`. Publication, provider delivery and financial settlement require their own evidence. Pending runtime checks are identified separately from completed automated checks.

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

The actual emailed portal link rendered the intended two documents. Internal staff notes were absent from the message and portal content. This exposed a zero-balance presentation defect: payment language remained visible despite no collectible balance. The later source correction and its local rendering tests are separate from these already delivered messages; its completed canonical rendering check is recorded below. Invitation delivery was not tested or forced past Starter's one-seat limit. See [document delivery evidence](email-and-photo-storage.md).

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

Evidence resides in `stripe-sandbox-readonly-proof.json`, `stripe-completed-sandbox.json`, `stripe-event-e2e.json`, `stripe-event-e2e-v2.json`, and `stripe-event-e2e-v3.json` under `/tmp/fieldclose-release`. The original Stripe CLI verified signatures; the local relay then forwarded exact event payloads using separate local signing secrets. The sandbox listener emitted `2026-03-25.dahlia` events; live destinations remain pinned to `2025-02-24.acacia`.

The first connected-payment replay checker incorrectly expected a billing-event-table claim for this Connect event. The corrected check completed at **14:47:29.951 UTC**, against isolated local production build `UodLfhdqqHcpsFC27GgOp`. It retrieved the existing `evt_1UKIuzBEDgDA9wtdo1Djzeqn` from Stripe and submitted it twice: both handler responses were **200**, and the invoice retained **exactly one succeeded $125 payment**, **paid** status and **zero outstanding**. The v3 receipt records the provider-read replay separately from the original signature-verified delivery; it does not claim that a fresh Stripe delivery signature accompanied the replay.

## Final automated revision — `06b5b7b`

Application revision **`06b5b7b74caaf965115f60cf36884314c4c90935`** passed **1,418 unit tests**, **128 PostgreSQL integration tests**, type checking and a production build. Database tests used isolated loopback PostgreSQL. [GitHub CI run 36327161870](https://github.com/Klerno-Labs/hvac-saas/actions/runs/36327161870) independently completed successfully at **14:49:44 UTC**, including clean install, migrations on its disposable database, type checking, build, both test suites and the production-dependency audit gate.

This revision includes the zero-balance portal/email correction and coordinated invoice-payment reservations across online Checkout and Terminal. Tests cover concurrent attempts, provider-response uncertainty, captured-payment recovery, authorization, explicit cancellation of verified unprocessed Terminal attempts, and preservation of webhook-only settlement. These automated results supersede the earlier suite totals for source validation; they do not rerun or relabel the earlier 23 authenticated HTTP checks, document deliveries or reminder check as results from this revision.

The final local browser run signed in as the synthetic merchant owner, connected a simulated reader and explicitly selected **Cancel payment attempt**. The UI returned to idle with $125 outstanding. An independent read-only database transaction at **14:54:20.409 UTC** verified that intent `pi_3UKJRZBEDgDA9wtd1bGNWUkv` had exactly one **canceled** Terminal payment and one **retired** reservation. The invoice remained **sent**, with total and outstanding both **12,500 cents**. The sanitized receipt is `/tmp/fieldclose-release/terminal-explicit-cancellation-local-proof.json`, SHA-256 `d06c095ba7231f8a833cab0d014d132d5cefafbf4d49870aa9f71a227a2f0aa7`. This establishes explicit cancellation cleanup, not collection or capture completion.

## Final-build browser payment verification

On the isolated local final build at `127.0.0.1:3308`, the customer portal's **Pay now** link for `fc-complete-20260927-1-online-final` opened Stripe's $125 sandbox Checkout. Completing it returned to a **Paid** invoice without a payment CTA. The actual signed Checkout event `evt_1UKJTIBEDgDA9wtdSdiGxFEZ` returned **200** and reconciled intent `pi_3UKJTGBEDgDA9wtd0Ik5ovPs`.

After the separately verified cancellation, the operator restarted Terminal, connected the simulated reader and selected **Present card & collect**. The UI progressed through capture and **Awaiting invoice confirmation**. Signed payment-intent event `evt_3UKJTMBEDgDA9wtd0572daLt` returned **200** for intent `pi_3UKJTMBEDgDA9wtd0IkhjbiI`. Selecting Done and reloading showed **E2E-TERMINAL paid** with no invoice ready for collection. Evidence images are `/tmp/fieldclose-release/final-customer-checkout-paid.png` and `/tmp/fieldclose-release/final-terminal-paid.png`.

An independent read-only database check at **14:58:46.300 UTC** confirmed all three sandbox invoices—the earlier online invoice, final online invoice and Terminal invoice—were **paid with zero outstanding**, with **exactly one succeeded $125 payment per invoice** and **no pending payments**. The original canceled Terminal payment remained canceled and its reservation retired. Successful reservations retain their provider identities with `active=true`: this field means not provider-confirmed canceled/expired, not necessarily awaiting payment. Payment creation rejects paid/zero invoices before considering reservations. The first checker incorrectly expected all settled reservations to be retired; its failed receipt is preserved. The corrected contract check found **no active attempt on a collectible invoice**, without changing any records. Its receipt is `/tmp/fieldclose-release/final-sandbox-payment-ledger-proof-v2.json`, SHA-256 `9e62b1b151395b9dab07b2b117c6c5b4ada0098f138af911ead0932fece5db17`.

A separate **GET-only** provider verification at **14:58:18.163 UTC**, using API version `2025-02-24.acacia`, confirmed the expected sandbox platform and connected account, invoice/organization metadata, USD 125 amounts and matching identities for the canceled Terminal intent and both final successful intents. Stripe reported zero received for the canceled intent and $125 received for each successful intent. The final Checkout session was **complete/paid** and referenced exactly the expected payment intent. The sanitized receipt is `/tmp/fieldclose-release/final-provider-payment-proof.json`, SHA-256 `dbd82c8128c2d35979d9571c6ab45ebd75fb9adb538b67f0e809883257ae7e48`; it contains no credentials, client secrets or bearer URLs.

These completed local browser/provider flows do not establish physical-reader behavior, live charges, refunds, disputes or bank payouts. Publication and scheduler activation are recorded separately below.

## Final public promotion and scheduler activation

At **14:58:40 UTC**, final application revision `06b5b7b74caaf965115f60cf36884314c4c90935`, deployment **`dpl_npJvDDwFEywEHGLKE2bAtCg6Sf16`**, was promoted to **https://fieldclose.app**. The subsequent hosted checks completed at **14:59:04 UTC** with **24 page/access probes and eight additional checks passing**. This supersedes the earlier paused `dpl_Cm2JaHVU8KdKKojZUdUgdXJGkzWu` runtime observation; historical delivery checks above retain their original deployment scope.

At **14:59:35.427 UTC**, the actual previously emailed portal link was reopened on the canonical release. Both the portal list and zero-balance invoice detail displayed **No payment due**, the invoice total remained **$0.00**, and neither a payment CTA nor internal staff notes appeared. No email was resent and no payment/approval action was submitted. The receipt and screenshot are `/tmp/fieldclose-zero-invoice-canonical-receipt.json` and `/tmp/fieldclose-zero-invoice-canonical-verified.png`. This is a rendering check in the existing owner browser, not a new anonymous or cross-customer authorization test.

The final scheduler check pinned the exact public deployment and confirmed Vercel scheduling enabled, its deployment matching the public alias, and the deployed explicit `SCHEDULED_TASKS_ENABLED=true` configuration. Email and monitoring were configured, SMS credentials were absent, workspace SMS/collections were disabled, and the eligible work queues were empty. Exact UTC schedules were verified: recurring generation **02:00 daily**, collections **03:00 daily**, and appointment reminders **15:00 daily**.

All three authenticated public routes returned **200**, `success: true`, `Cache-Control: no-store`, and zero work/errors. Before/after aggregate counts were identical: one workspace, two jobs, one retained reminder event, one invoice, and no eligible unpaid invoice, recurring schedule or collection attempt. No new fixture or message was created by this check. The sanitized receipt is `/tmp/fieldclose-release/scheduled-activation-execution-2026-09-27T14-59-06-896Z.json`.

This establishes publication, the running configuration, and actual authenticated zero-work execution. Provider-initiated calendar invocation remains unverified at this entry, as do physical-reader operation, live financial settlement, outage/recovery notification transitions and staffed operational response. The local sandbox evidence above is not relabeled as a production charge.

## Verification cleanup and schedule-observation limit

After completion, the temporary isolated app, local event relay and Stripe CLI listener were stopped; ports 3308 and 3309 were confirmed closed. Private credential-pipe, synthetic-login and bearer-link handoff files were removed, and browser secret bindings were reset. Sanitized receipts and retained synthetic records remain available for audit. Production credentials were not removed. Both test subscriptions retain their verified period-end cancellation.

The bounded read-only log observation at 15:00:33 UTC found the manual authenticated reminder check at 14:59:03.953 UTC and the earlier unauthorized boundary probe, but no independently identifiable provider-triggered appointment invocation. Logs did not establish request origin. This observation does not prove a missed run, and no additional messages were sent to manufacture evidence. Actual calendar invocation and missed-run response remain unverified.

A durable, sanitized summary of the final release checks and source-receipt hashes is committed in [release evidence](evidence/2026-09-27-release.json).
