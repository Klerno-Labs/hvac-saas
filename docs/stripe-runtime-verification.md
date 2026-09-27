# Stripe runtime verification evidence

Recorded September 27, 2026 (UTC). This is the source of truth for the **limited restricted-test-key API probes** below. It does not establish completed customer payment flows or live readiness. Credentials, client secrets, bearer URLs, and raw provider messages are excluded.

## Public deployment and implemented safeguard

A separate owner-authorized SEO workflow promoted deployment `dpl_EDUtYCYk46GJUnWRnUSPJhCamz3A` to `fieldclose.app`. That deployment still has test Stripe configuration. The safeguard described here is implemented in the working application and validated locally; its deployment to the public alias has **not yet been confirmed**. Do not describe live billing or the hosted safeguard as operational on this evidence alone.

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

The safeguard was committed as `2bd9b01`; its production build, 1,162 unit tests, and 96 integration tests across 16 integration files passed. Integration checks ran only against the verified disposable loopback database, with all ten migrations current. A protected production deployment has started; public-alias promotion and hosted verification are not yet confirmed. Live keys, coherent price/portal/webhook configuration, and completed signed live flows are still required.

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

## Remaining verification

Do not label all scopes or payments ready. Actual subscription retrieval after completed checkout, hosted Checkout and portal completion, connected-account Checkout success, Terminal collection/capture, signed webhook reconciliation, and all live flows remain unverified. No real charge, legal-terms acceptance, completed account onboarding, or automatic permission expansion was performed as part of these probes.

Review the exact connected-account validation failure and incomplete account state before an explicitly authorized next sandbox step. Do not infer that broader permissions will resolve it or automatically submit financial details or accept terms. Terminal completion needs a simulated-reader flow rather than token or PaymentIntent creation alone. [Terminal testing](https://docs.stripe.com/terminal/references/testing)
