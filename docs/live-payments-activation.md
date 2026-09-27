# FieldClose live payment activation

The original inventory below was recorded on September 26, 2026. It was read-only; subsequent authorized activation work is recorded separately here. Neither provider configuration nor a successful read proves completed payment settlement.

## Public activation — September 27, 2026, 13:09 UTC

Deployment `dpl_GkUyXefERdVdNsQ9EBsrR9E3xMvj`, application revision `992dcf3`, now serves **https://fieldclose.app** with the complete live configuration described below. GitHub CI passed. The protected candidate passed 24 page/access checks, seven page metadata/support checks plus deployment protection, and nine signed webhook boundary checks. Public alias, health, page, support and authentication checks passed after promotion. The same nine signed webhook checks passed publicly: invalid signatures and wrong account scopes are rejected; signed sandbox events and unassociated live events are acknowledged without processing.

These were deliberately synthetic signed requests, not events delivered by Stripe or completed customer payments. They establish deployed secret matching, mode/scope boundaries and unrelated-event handling; they do not certify subscription settlement, Connect onboarding, invoice payment reconciliation or Terminal capture.

Both new destinations are **enabled** with their verified scopes and pinned payload version. Only the two superseded FieldClose destinations are disabled; Nothing But Bots and RewriteMe destinations remain active and unchanged. The raw API version of the old apex destination is null (account default); its earlier dashboard displayed effective `2026-03-25.dahlia`. The legacy `www` destination explicitly uses that version. Preserve this distinction in any recovery plan.

**Earlier cleanup handoff, superseded by the completion below:** at this release checkpoint, the expiration action had been submitted for `FieldClose webhook setup — temporary`, key ID `mk_1UKHUoPgFInaK96krkwwHIjX`, but Stripe opened a security-key/Touch ID or authenticator challenge. Revocation was not yet confirmed. The key had only webhook-management write access and was never deployed.

### Temporary access cleanup completed — September 27, 2026, 13:29 UTC

After the owner completed identity verification, a fresh, fully loaded Stripe API-key list confirmed the temporary setup key was absent, **FieldClose production runtime** remained present, and no verification dialog remained. Revocation is **UI-confirmed**. No API 401 test was performed: the temporary secret had already been cleared from memory and was not retrieved again.

Canonical-domain owner sign-in and the authenticated photo workflow remain pending. Scheduled tasks remain disabled, no real charge was made, and provider-originated billing/customer-payment outcomes and complete live financial workflows still require verification.

## Activation update — September 27, 2026, 12:50 UTC

The owner completed Stripe identity verification. The approved **FieldClose production runtime** restricted live key and matching live publishable key are saved in Vercel Production. The restricted sandbox key remains Preview-only. No live charge was made. The existing public deployment retains its prior immutable test configuration and rejects payment operations; staged environment changes are not yet live.

Both live product/price pairs in the table below were rechecked in the live dashboard: active, flat-rate USD monthly pricing at $49 and $99. The Starter product description now correctly allows one owner. Pro's unlimited-user description matches current runtime enforcement. Their exact IDs are staged in `STRIPE_STARTER_PRICE_ID` and `STRIPE_PRO_PRICE_ID`.

A separate active live portal, `bpc_1UKHNvPgFInaK96kr3OtlaZR`, is created and staged in `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`. Verified settings include the FieldClose headline, application return URL, correct legal links, invoice history, payment-method updates, cancellation at period end, and disabled plan changes. The other product's default portal is unchanged.

The owner separately approved a temporary key with only **Webhook Endpoints, Event Destinations: Write**. It prepared these destinations at payload version `2025-02-24.acacia`, with distinct signing secrets saved as Production Secrets. The dashboard independently confirms their scopes. Both replacements are currently **disabled**, pending handler ownership fixes and coordinated deployment:

| Destination | Scope | Signing-secret setting |
| --- | --- | --- |
| `we_1UKHWtPgFInaK96kqlGDb6mf` | Your account, `/api/billing/webhook` | `STRIPE_WEBHOOK_SECRET` |
| `we_1UKHWwPgFInaK96k49rieOJA` | Connected accounts, `/api/stripe/webhook` | `STRIPE_CONNECT_WEBHOOK_SECRET` |

Shared-account review found that unrelated subscriptions and paid Checkout events could be retried rather than ignored, and initial subscription matching needed stronger product ownership checks. Do not enable replacements until those corrections pass regression verification. The temporary setup key must be expired after the approved setup; it is not deployed. Old FieldClose destinations remain unchanged at this timestamp.

The separate fresh production database is already created, migrated, SSL-enforced, backed up and restore-tested; the historical pending-creation note below is superseded. The old database's contents remain unknown and unrecovered. See [production activation](production-activation.md).

## Historical inventory — September 26

| Item | Verified state |
| --- | --- |
| Vercel project | `fieldclose`, project `prj_ULPb9pDQhNgjX1ejVndfqFfSDpKj`, team `team_FlOtnAgRKPsoShVhyGVSQAQy` |
| Configured Stripe credentials | Production `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` are **test-mode** credentials. No preview, development, custom-environment, or branch-specific live Stripe credentials were found in this project. |
| Account reached by the configured key | Pegrio LLC sandbox, `acct_1TMx2eBqF8hjPLwn`. Its enabled test capabilities do not establish live payment readiness. |
| Sandbox destinations and portal | No webhook endpoints or Billing Portal configurations were returned by the sandbox API. `STRIPE_CONNECT_WEBHOOK_SECRET` is absent in Vercel production. |
| Existing live account | [Pegrio LLC, `acct_1TMx2XPgFInaK96k`](https://dashboard.stripe.com/acct_1TMx2XPgFInaK96k/account/status). The live dashboard showed Payments and Payouts active, with no active account-status tasks. Connect setup showed identity verification and integration choices complete. |
| Live API access | Not available through the configured Vercel credentials. The live inventory below was read from the existing signed-in Stripe dashboard, not inferred from the sandbox. |
| Existing live key retrieval | Existing standard secret keys were masked with no retrieval action, and none was named FieldClose. One generic restricted key offered **Reveal**, but its permissions and ownership were not verified. Its presence does not establish that it is suitable for FieldClose; do not reveal or reuse it speculatively. |

The live account also hosts other Pegrio products. Keep all activation changes specific to FieldClose. Do not change another application's endpoints, prices, portal configuration, or account-wide settings as a shortcut.

## Reuse the existing live prices

| Plan | Product | Price | Amount |
| --- | --- | --- | --- |
| Starter | `prod_UyyWcxvET6GrXM` | `price_1Tz0ZSPgFInaK96klZqXxHJ0` | USD 49.00, monthly |
| Pro | `prod_UyyWKgOdzlevPF` | `price_1Tz0ZTPgFInaK96k6KV5HDxw` | USD 99.00, monthly |

Both products were active in the live dashboard. After live API access is configured, verify the prices are live, active, fixed licensed monthly recurring prices with active products before installing their IDs. Do not create duplicate products merely because the current environment refers to test prices.

At the original inventory, the Starter description said **“Up to 5 users.”** It has since been corrected to one owner, as recorded above. Pro supports team members; do not add unimplemented support or service commitments to the provider copy.

## Replace the old webhook arrangement with explicit scopes

The following live destinations already exist:

| Destination | Current state |
| --- | --- |
| `we_1Tz0g3PgFInaK96kqqPeYcFn` → `https://fieldclose.app/api/stripe/webhook` | Active, **Your account** scope, payload version `2026-03-25.dahlia`. Events: `account.updated`, `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.deleted`, `customer.subscription.updated`, `payment_intent.payment_failed`, `payment_intent.succeeded`. |
| `we_1TN1BMPgFInaK96kxP2IMyhp` → `https://www.fieldclose.app/api/stripe/webhook` | Active, **Your account** scope, payload version `2026-03-25.dahlia`. Events: `account.updated`, `checkout.session.completed`, `checkout.session.expired`. |

Neither destination has connected-account scope. The apex destination omits the invoice billing events required by the current handler. Their payload version also differs from the app's pinned SDK and payload contract. Zero deliveries during the inspected week is not delivery proof. The relationship between their signing secrets and Vercel's existing secret was not verified.

Use two **snapshot-event** destinations with payload API version **`2025-02-24.acacia`**, matching `lib/stripe.ts` and the handlers:

| URL | Scope | Environment variable | Events |
| --- | --- | --- | --- |
| `https://fieldclose.app/api/billing/webhook` | Your/platform account | `STRIPE_WEBHOOK_SECRET` | `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded` |
| `https://fieldclose.app/api/stripe/webhook` | Connected accounts | `STRIPE_CONNECT_WEBHOOK_SECRET` | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated` |

Each destination must have its own signing secret. Install the matching secrets securely in Vercel; do not paste them into chat, documentation, commands that print values, or repository files. The application deliberately rejects scope mismatches and ignores the opposite payment mode. Live Connect destinations can also receive test events, so preserve the signed `livemode` check. See [Stripe's Connect webhook guidance](https://support.stripe.com/questions/connect-account-webhook-configurations?locale=en-GB).

Prepare the replacement configuration without exposing an unready database to live events. During the coordinated cutover, disable superseded **FieldClose-only** destinations after the correct endpoints and secrets are installed and verified. Keep their non-secret configuration recorded for recovery. Do not delete or change other Pegrio webhook destinations. Do not rely on an HTTP redirect from the old `www` URL for webhook delivery.

## Use a dedicated FieldClose billing portal

The live account has one visible portal configuration: `bpc_1UIxkFPgFInaK96kChhGXS94`, named Default. Its preview displays **Nothing But Bots by Pegrio LLC** and returns customers to `portal.nothingbutbots.com`. Do not repurpose that default.

Create an active FieldClose-specific live configuration and set its ID in `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`. Both application entry points accept this optional `bpc_…` identifier; an invalid explicit identifier fails closed. Leaving it unset uses Stripe's account-wide default, which is unsuitable for this shared account.

Configure the FieldClose portal with:

- Default return URL `https://fieldclose.app/settings/billing`.
- Payment-method updates, invoice history, and subscription cancellation enabled; review cancellation timing against the published subscription terms.
- Subscription price/plan updates **disabled**. The current webhook resolves plan entitlements from subscription metadata; allowing portal price changes would not reliably update that metadata. Supporting plan changes requires a separate, tested entitlement change.
- FieldClose-specific headline and legal links to `https://fieldclose.app/privacy` and `https://fieldclose.app/terms`. Review the rendered preview without altering shared account branding for other products.

Stripe supports selecting a configuration when creating a portal session; see [customer portal configurations](https://docs.stripe.com/api/customer_portal/configurations/object).

## Use a dedicated restricted API key

Prefer a dedicated FieldClose restricted key over a full-access standard secret key for this shared Pegrio account. The current application accepts `rk_test_…` and `rk_live_…` in `STRIPE_SECRET_KEY`; its single Stripe client uses that key for both platform and connected-account requests. Stripe documents restricted keys as drop-in replacements, with separate permissions for connected accounts. A dedicated key also allows FieldClose credentials to be revoked or rotated without rotating another application's key. See [restricted API keys](https://docs.stripe.com/keys/restricted-api-keys).

The following baseline comes from the application's actual API calls. It is a starting permission set to verify in sandbox, not evidence that a restricted key has passed every flow. Resource labels may differ in the Dashboard; Write includes Read.

| Request scope | Resource permission | Runtime operations |
| --- | --- | --- |
| Platform | Customers: **Write** | Create subscription customers. |
| Platform | Checkout Sessions: **Write** | Create, list, retrieve, and expire subscription Checkout sessions. |
| Platform | Subscriptions: **Read** | Find existing subscriptions and retrieve current state during billing webhook reconciliation. |
| Platform | Customer Portal Sessions: **Write** | Create sessions for the FieldClose billing portal configuration. |
| Platform | Connect Accounts: **Write** | Create Express accounts and retrieve current account capabilities. |
| Platform | Account Links: **Write** | Create Express onboarding links. |
| Connected accounts | Checkout Sessions: **Write** | Create, retrieve, and expire invoice Checkout sessions, including inline pricing and application fees. |
| Connected accounts | Payment Intents: **Write** | Create, retrieve, and capture Terminal payments, including application fees. |
| Connected accounts | Terminal Connection Tokens: **Write** | Create tokens for the Terminal SDK. |

Account creation, capability refresh, and onboarding-link creation are platform-scoped requests. Invoice payment and Terminal requests supply the organization's connected account through `Stripe-Account`; enable their corresponding connected-account permissions explicitly. See [Connect authentication](https://docs.stripe.com/connect/authentication).

No direct runtime calls require refunds, transfers, payouts, bank-account management, balance access, or webhook-endpoint writes. Leave unrelated permissions disabled initially. Webhook signature verification uses separate destination signing secrets locally, so it does not itself need Events read permission or webhook-endpoint write permission. Billing reconciliation still needs the Subscriptions read permission listed above. See [API keys and webhook signing secrets](https://docs.stripe.com/keys).

Verify a dedicated restricted **test** key with new and repeated subscription checkout, subscription recovery, billing portal access, Express onboarding and refresh, connected-account invoice checkout with inline product/pricing and an application fee, Terminal token creation/payment capture, and signed subscription webhook reconciliation. Inspect denied requests for additional resource dependencies and add only demonstrated requirements; then configure an equivalent dedicated live key. Do not assume the existing generic restricted key covers these operations or expand to full account access merely to silence a denied request. No live charge is authorized by this procedure.

Restricted permissions limit API resource families; they do not enforce FieldClose's organization metadata as a Stripe-side boundary. Consequently, this permission model should not be treated as isolation from other Pegrio records within the same account. Keep tenant checks in the application and keep account-wide changes out of routine activation.

### Keep manual diagnostics separate

The optional `scripts/check-provider-services.mjs` audit reads platform account details, Prices with expanded Products, webhook endpoints, and billing portal configurations. Those diagnostic reads are not all runtime requirements. Prefer a separate read-only operator key supplied only to the manual audit process, rather than broadening the deployed application's key for diagnostics. A restricted runtime key may correctly deny a diagnostic read; that denial is not a reason to grant write access. Neither diagnostic access nor a successful read proves delivery or payment reconciliation. See [Stripe API key practices](https://docs.stripe.com/keys-best-practices).

## Smallest secure owner step

1. In the existing Pegrio LLC account, have the owner create and verify a dedicated restricted test key using the baseline above, then create the corresponding dedicated live key through the [live API keys page](https://dashboard.stripe.com/acct_1TMx2XPgFInaK96k/apikeys). Use the matching live publishable key. The observed standard secrets cannot be retrieved through the inspected interface, and the generic restricted key is not verified for reuse. Let the owner complete any required Stripe verification; do not rotate another application's key or require a full-access standard key by default.
2. In Vercel, open the **FieldClose** project's Environment Variables settings. Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` for **Production only** using the secure settings interface. Keep the values out of chat and repository files. Never replace the live account with a newly created financial account merely to obtain a key.
3. Do **not** redeploy just the key change. Complete the live price IDs, two destination secrets, dedicated portal configuration, and database checks together before building the candidate. Environment changes affect newly created deployments, not an already running release.

Once the runtime key is installed and appropriate separate diagnostic access is available, authorized maintenance can verify the existing live resources and prepare the FieldClose-specific configuration without asking the owner to enter every non-secret ID manually. This document does not authorize charges, creation or disclosure of credentials, or account-wide changes.

## Database and cutover precautions

The original configured database `db.kcrwvvxhcncbemgvtodl.supabase.co` was unavailable. The owner has authorized a **fresh, separate database**; project creation remains pending the owner's password entry and metered-hosting action. Preserve the original database references and recovery records. A fresh database is a new launch workspace, not recovery or migration of the unavailable database's records. Do not overwrite the original environment or claim existing customers, invoices, balances, or payment links have been restored.

Before promotion:

1. Follow [the database release sequence](deployment-guide.md), apply committed migrations to the explicitly selected new database, and record backup/recovery evidence. Do not seed it with fabricated customers or financial history. Keep `SCHEDULED_TASKS_ENABLED=false` until release checks pass.
2. Verify that any retained/imported `stripeCustomerId`, `stripeSubscriptionId`, and `stripeConnectedAccountId` belong to the **live** account. The inspected sandbox has connected accounts `acct_1TMxs1PcO2nblD9T` and `acct_1TMxekBqF8fZC7CV`; neither is live onboarding proof. Do not silently erase or reuse test identifiers or capability flags. A real organization must complete its own live connection.
3. Build a protected candidate with the complete configuration. Read-only provider checks can inspect resource shape and availability, but cannot certify secret matching, account scope, delivery, private storage permissions, or actual payment reconciliation. `node scripts/check-provider-services.mjs` intentionally leaves these checks unverified and exits nonzero while any prerequisite remains blocked or unverified.
4. Run the authorized sandbox workflow against isolated data first. Production validation must then verify signed live-mode delivery and the resulting database state using explicitly authorized live activity; never create a real charge merely as a connectivity probe. A Checkout success redirect or Stripe capability flag does not mark an invoice paid.
5. Verify subscription activation/cancellation, duplicate event handling, connected-account invoice settlement, balance consistency, and portal access. Confirm the new database can associate incoming events with the intended organizations; an empty database must not pretend to know subscriptions from the unavailable database.
6. Promote only after the owner-dependent steps and release checks are complete. Record deployment and destination IDs, versions, test results, and rollback limits without secrets. Keep old database recovery possible and avoid redirecting webhook traffic to an incompatible old release during rollback.
