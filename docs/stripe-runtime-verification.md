# Stripe runtime verification evidence

Recorded September 27, 2026 (UTC). The initial restricted-key probes are historical; the later completed sandbox workflows below supersede their incomplete-account and uncompleted-checkout results. Sandbox evidence does not establish live settlement. Credentials, client secrets, bearer URLs, and raw provider messages are excluded.

## Completed sandbox workflows — September 27, 2026

The authorized `fc-complete-20260927-1` run used the same restricted sandbox runtime grant and synthetic local organizations. It never accessed the production application database or charged real money.

- Both $49 Starter and $99 Pro hosted subscription Checkouts completed and Stripe reported paid/active with matching organization and plan metadata. Signed subscription notifications reconciled the isolated local organizations to their respective plans. Both subscriptions were then canceled at period end through the hosted customer portal; Stripe confirmed `cancel_at_period_end=true`.
- The owner approved submitting Stripe's test-account agreement. Hosted Connect onboarding used only Stripe's synthetic identity and bank test data. The test merchant reported submitted details, active card-payment/transfer capabilities, and enabled charges/payouts, with no currently due fields.
- A connected-account $125 test invoice Checkout completed. Its provider-originated, signature-verified notification produced one succeeded payment and a paid invoice with zero outstanding balance. The browser return URL alone was not used as payment evidence.
- One concurrent Pro subscription notification returned the intended retryable 500 after another event changed the billing snapshot. A provider-GET replay of that exact event succeeded, followed by a duplicate returning 200 with one durable processed event and unchanged financial state.

The official Stripe CLI verified provider signatures before a local relay forwarded exact payloads with separate local platform/Connect signing secrets. The CLI used the sandbox account's `2026-03-25.dahlia` event version; production destinations remain pinned to `2025-02-24.acacia`. The relay is local verification, not evidence that a live destination received a real financial event. Provider-read replays are explicitly distinguished from original signed deliveries in the receipts. The initial connected-checkout replay checker incorrectly expected a billing WebhookEvent record; Connect instead deduplicates the payment ledger. The corrected v3 check passed on the final build: two 200 responses, exactly one succeeded payment and unchanged paid/zero-balance state.

Final application revision `06b5b7b` also passed actual browser workflows against its isolated production build `UodLfhdqqHcpsFC27GgOp`:

- The customer portal created a new $125 sandbox Checkout through the application, received the provider's signed completion event, and returned a paid invoice without a payment action.
- The staff workflow connected Stripe's simulated reader. Explicit cancellation canceled the unprocessed intent, retired that reservation, and preserved the outstanding balance. Starting again collected and captured a new $125 test payment. The page waited for invoice confirmation; after the signed event and reload, the invoice was paid with zero outstanding.
- GET-only provider verification at **14:58:18 UTC**, pinned to `2025-02-24.acacia`, confirmed the exact account, invoice, amount and currency of both completed payments, zero received on the canceled intent, manual/card-present Terminal configuration, and a completed/paid Checkout pointing to the expected intent.

Successful-payment reservations remain retained as duplicate-prevention records; this is distinct from a pending payment. Paid/zero invoices cannot start or cancel another attempt. Cancellation/expiry retires a reservation so an unpaid invoice can safely start again. An initial verification assertion requiring all reservations to be retired was stricter than this contract; the original receipt is preserved alongside the corrected ledger proof.

Sanitized local evidence includes `stripe-completed-sandbox.json`, `stripe-event-e2e.json`, `stripe-event-e2e-v2.json`, `stripe-event-e2e-v3.json`, `terminal-explicit-cancellation-local-proof.json`, and `final-provider-payment-proof.json` in `/tmp/fieldclose-release`. No credentials, client secrets or hosted bearer links are included. The final deployment and public checks are recorded in [launch verification](launch-verification-2026-09-27.md). No physical reader, live charge, refund, dispute or bank payout was tested.

## Historical production safeguard checkpoint

After the separate owner-authorized SEO deployment, the verified safeguard deployment `dpl_84a73xxfUyx6ntFaTSa13Sc5ovNw` (application `2bd9b01`) was promoted to `fieldclose.app`. The alias and public health were confirmed at `2026-09-27T05:24:41Z`. Both public webhook endpoints return 503 configuration-unavailable for a synthetic invalid-signature probe under the current test-key production configuration. The production guard is active; live billing remains unavailable.

When `VERCEL_ENV=production`, the shared Stripe client now rejects test, missing, and malformed keys before any provider operation, including reuse of an existing client. A key change recreates the client. Subscription billing, invoice Checkout, Connect actions, and Terminal operations use this shared boundary; blocked payment actions return friendly errors, and the billing screen disables unavailable payment controls. Cached invoice Checkout sessions must still be retrieved through the guarded provider client rather than returning a stored URL directly.

Webhook verification returns 503 for unavailable production payment configuration before application data is read or changed. With live configuration, a correctly signed test event is acknowledged and ignored before application writes. Preview/development test mode remains available for isolated verification. This safeguard does not revoke already-issued Stripe-hosted links, erase earlier test records, verify live permissions, or configure live webhooks and prices.

The read-only production aggregate check at `2026-09-27T03:46:22Z` found:

| Record group | Count |
| --- | ---: |
| Organizations | 1 |
| `subscription_checkout_attempt` activity events | 0 |
| Invoices with a Checkout session | 0 |
| Connected accounts | 0 |
| Payments | 0 |

These are point-in-time application database counts, not an inventory of Stripe-hosted synthetic resources. They do not imply that the application contains no invoices or other internal verification records.

The safeguard was committed as `2bd9b01`; its production build, 1,162 unit tests, and 96 integration tests across 16 integration files passed. Integration checks ran only against the verified disposable loopback database, with all ten migrations current. The first cloud run timed out on the existing 501-invoice integration test. Test-only follow-up `538056a` retained the complete fixture, strengthened its assertions and set a documented per-case 30-second budget; full GitHub CI then passed. Production application code is identical to the promoted `2bd9b01` build. All 24 hosted page/access checks, seven metadata/support checks and deployment protection passed before promotion. Live keys, coherent price/portal/webhook configuration, and completed signed live flows are still required.

## Scope and permission configuration

The approved sandbox run was `fc-permissions-20260927-1` against Pegrio sandbox `acct_1TMx2eBqF8hjPLwn`, using API version `2025-02-24.acacia`. The Dashboard form contained eight resource rows across nine scopes, with no additional automatic selections:

| Dashboard resource | Platform | Connected accounts |
| --- | --- | --- |
| Customers | Write | None |
| Payment Intents | None | Write |
| Customer Portal | Write | None |
| Subscriptions | Read | None |
| Checkout Sessions | Write | Write |
| Account Links | Write | None |
| Accounts, under the Connect category | Write | None |
| Terminal Connection Tokens | None | Write |

All other permissions remained None. The Dashboard's Customer Portal row combines permissions; it has no separate Sessions row. The selected Accounts row is under Connect, not the separate Connect Accounts group. This is the tested starting configuration, not a guarantee that every app flow has sufficient permissions. Stripe recommends testing restricted keys and resolving actual denied requests before matching live grants. [Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys)

## Observed results

**20 of 21 probes passed.** Passing operations covered customer creation and subscription listing; Starter/Pro subscription Checkout creation, retrieval, listing, and expiration; a dedicated tagged test portal configuration and portal session; Express test-account creation/retrieval and onboarding-link creation; an unconfirmed card-present PaymentIntent and its retrieval; and a Terminal connection token. Sandbox identity was also checked. Portal-configuration creation was a synthetic fixture operation under the existing Customer Portal grant, not an application runtime requirement.

Existing Starter/Pro test prices were verified active, USD 49/99 monthly, licensed, with active test products. No enabled sandbox webhook destinations existed at the preceding read-only check. Synthetic resources contained no email recipient, hosted links were not opened, and the helper did not access the FieldClose production database.

Connected-account invoice Checkout creation failed:

| Attempt | Result | Stripe request ID |
| --- | --- | --- |
| Initial create | HTTP 400, `invalid_request_error`; no reported permission identifiers | `req_s7rCJzlwqRoBvS` |
| Exact retry with unchanged body, connected account, and idempotency key | HTTP 400, `invalid_request_error` | `req_a1C8S2BjlLsm5i` |

The diagnostic retrieved the exact created test account `acct_1UK8h6BEDgDA9wtd` and verified its run metadata before the retry. It observed:

- `charges_enabled=false`, `payouts_enabled=false`, and `details_submitted=false`.
- An empty capabilities map.
- `currently_due`, `eventually_due`, and `past_due` each containing `external_account`, `tos_acceptance.date`, and `tos_acceptance.ip`.
- An empty `pending_verification` list.

The retry's sanitized message classifier returned `account_onboarding_or_business_details`. That is a **heuristic classification**, not a confirmed root cause. Neither the account state nor the absence of a permission identifier proves that the key will support a completed connected-account Checkout flow. Stripe also cautions that sandbox capability enforcement can differ from live behavior. [Connect testing](https://docs.stripe.com/connect/testing)

## Retained synthetic evidence

| Resource | Identifier / state |
| --- | --- |
| Customer | `cus_VKoJ24U8UTWukR` |
| Portal configuration | `bpc_1UK8h5BqF8hjPLwn55z5nYEg` |
| Express test account | `acct_1UK8h6BEDgDA9wtd`; onboarding incomplete |
| PaymentIntent | `pi_3UK8h9BEDgDA9wtd02l9ZKvo`; unconfirmed |
| Starter and Pro Checkout sessions | Both created sessions were expired; exact IDs retained in the sanitized local summary |

The local supporting receipts are `/tmp/fieldclose-release/stripe-sandbox-validation-run-1-summary.json` and `/tmp/fieldclose-release/stripe-connected-checkout-diagnostic.json`. They contain sanitized evidence only. The helper's result field now remains `status: failed`, with the HTTP code stored separately as `httpStatus`; the original field collision did not change the provider outcome.

## Remaining verification at the initial probe checkpoint (historical)

Do not label all scopes or payments ready. Actual subscription retrieval after completed checkout, hosted Checkout and portal completion, connected-account Checkout success, Terminal collection/capture, signed webhook reconciliation, and all live flows remain unverified. No real charge, legal-terms acceptance, completed account onboarding, or automatic permission expansion was performed as part of these probes.

Review the exact connected-account validation failure and incomplete account state before an explicitly authorized next sandbox step. Do not infer that broader permissions will resolve it or automatically submit financial details or accept terms. Terminal completion needs a simulated-reader flow rather than token or PaymentIntent creation alone. [Terminal testing](https://docs.stripe.com/terminal/references/testing)
