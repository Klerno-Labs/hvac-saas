# FieldClose live payment activation

This is a read-only inventory recorded on September 26, 2026 and a proposed cutover procedure. It is not evidence that live payments or webhook delivery have passed an end-to-end test. No charges, credentials, webhook destinations, products, or hosting settings were changed during the inventory.

## Verified accounts and deployment state

| Item | Verified state |
| --- | --- |
| Vercel project | `fieldclose`, project `prj_ULPb9pDQhNgjX1ejVndfqFfSDpKj`, team `team_FlOtnAgRKPsoShVhyGVSQAQy` |
| Configured Stripe credentials | Production `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` are **test-mode** credentials. No preview, development, custom-environment, or branch-specific live Stripe credentials were found in this project. |
| Account reached by the configured key | Pegrio LLC sandbox, `acct_1TMx2eBqF8hjPLwn`. Its enabled test capabilities do not establish live payment readiness. |
| Sandbox destinations and portal | No webhook endpoints or Billing Portal configurations were returned by the sandbox API. `STRIPE_CONNECT_WEBHOOK_SECRET` is absent in Vercel production. |
| Existing live account | [Pegrio LLC, `acct_1TMx2XPgFInaK96k`](https://dashboard.stripe.com/acct_1TMx2XPgFInaK96k/account/status). The live dashboard showed Payments and Payouts active, with no active account-status tasks. Connect setup showed identity verification and integration choices complete. |
| Live API access | Not available through the configured Vercel credentials. The live inventory below was read from the existing signed-in Stripe dashboard, not inferred from the sandbox. |

The live account also hosts other Pegrio products. Keep all activation changes specific to FieldClose. Do not change another application's endpoints, prices, portal configuration, or account-wide settings as a shortcut.

## Reuse the existing live prices

| Plan | Product | Price | Amount |
| --- | --- | --- | --- |
| Starter | `prod_UyyWcxvET6GrXM` | `price_1Tz0ZSPgFInaK96klZqXxHJ0` | USD 49.00, monthly |
| Pro | `prod_UyyWKgOdzlevPF` | `price_1Tz0ZTPgFInaK96k6KV5HDxw` | USD 99.00, monthly |

Both products were active in the live dashboard. After live API access is configured, verify the prices are live, active, fixed licensed monthly recurring prices with active products before installing their IDs. Do not create duplicate products merely because the current environment refers to test prices.

The live Starter description currently says **“Up to 5 users.”** Correct that FieldClose product description to the app's actual Starter allowance of one owner before sending customers to Checkout. Pro supports team members; do not add unimplemented support or service commitments to the provider copy.

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

## Smallest secure owner step

1. Open the existing **live** Pegrio LLC account's [API keys page](https://dashboard.stripe.com/acct_1TMx2XPgFInaK96k/apikeys). Use its existing authorized live secret key and matching live publishable key. If a key cannot be retrieved, the owner must handle any credential creation or verification required by Stripe.
2. In Vercel, open the **FieldClose** project's Environment Variables settings. Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` for **Production only** using the secure settings interface. Keep the values out of chat and repository files. Never replace the live account with a newly created financial account merely to obtain a key.
3. Do **not** redeploy just the key change. Complete the live price IDs, two destination secrets, dedicated portal configuration, and database checks together before building the candidate. Environment changes affect newly created deployments, not an already running release.

Once the live key is installed, authorized maintenance can verify the existing live resources and prepare the FieldClose-specific configuration without asking the owner to enter every non-secret ID manually. This document does not authorize charges or account-wide changes.

## Database and cutover precautions

The original configured database `db.kcrwvvxhcncbemgvtodl.supabase.co` was unavailable. The owner has authorized a **fresh, separate database**; project creation remains pending the owner's password entry and metered-hosting action. Preserve the original database references and recovery records. A fresh database is a new launch workspace, not recovery or migration of the unavailable database's records. Do not overwrite the original environment or claim existing customers, invoices, balances, or payment links have been restored.

Before promotion:

1. Follow [the database release sequence](deployment-guide.md), apply committed migrations to the explicitly selected new database, and record backup/recovery evidence. Do not seed it with fabricated customers or financial history. Keep `SCHEDULED_TASKS_ENABLED=false` until release checks pass.
2. Verify that any retained/imported `stripeCustomerId`, `stripeSubscriptionId`, and `stripeConnectedAccountId` belong to the **live** account. The inspected sandbox has connected accounts `acct_1TMxs1PcO2nblD9T` and `acct_1TMxekBqF8fZC7CV`; neither is live onboarding proof. Do not silently erase or reuse test identifiers or capability flags. A real organization must complete its own live connection.
3. Build a protected candidate with the complete configuration. Read-only provider checks can inspect resource shape and availability, but cannot certify secret matching, account scope, delivery, private storage permissions, or actual payment reconciliation. `node scripts/check-provider-services.mjs` intentionally leaves these checks unverified and exits nonzero while any prerequisite remains blocked or unverified.
4. Run the authorized sandbox workflow against isolated data first. Production validation must then verify signed live-mode delivery and the resulting database state using explicitly authorized live activity; never create a real charge merely as a connectivity probe. A Checkout success redirect or Stripe capability flag does not mark an invoice paid.
5. Verify subscription activation/cancellation, duplicate event handling, connected-account invoice settlement, balance consistency, and portal access. Confirm the new database can associate incoming events with the intended organizations; an empty database must not pretend to know subscriptions from the unavailable database.
6. Promote only after the owner-dependent steps and release checks are complete. Record deployment and destination IDs, versions, test results, and rollback limits without secrets. Keep old database recovery possible and avoid redirecting webhook traffic to an incompatible old release during rollback.
