# Deploying FieldClose to Vercel

Follow [the release sequence](deployment-guide.md) before promoting a deployment. A working database and applied migrations are prerequisites for the application, even when a build succeeds.

## Project settings

Import the application repository and set **Root Directory** to `app-scaffold/hvac-app`, framework to **Next.js**, and Node.js to **24.x**, matching CI and the configured Vercel runtime. The committed `vercel.json` runs `prisma generate && next build`. Dependency installation uses the committed package lock. The build does not migrate the database.

Set the production domain, then use its exact HTTPS origin for `AUTH_URL` and `APP_URL`. Configure preview environments separately with a test database and test integrations. Environment changes require a new deployment before the application uses them.

## Environment variables

Set values in the Vercel project environment settings. Preserve the exact value without a trailing newline; do not paste shell quotes around it.

| Purpose | Variables | Requirements |
| --- | --- | --- |
| Database | `DATABASE_URL` | Reachable PostgreSQL connection with the required TLS and connection-pool settings from the database provider. Migrations must use a connection that supports migration operations. |
| Authentication | `AUTH_SECRET`, `AUTH_URL` | Strong random signing secret; canonical HTTPS application origin. Keep the secret stable across routine releases. |
| Application links | `APP_URL` | Canonical HTTPS origin used for portal, payment, and email links. |
| Scheduled work | `CRON_SECRET` | Strong random bearer secret, at least 32 characters. Vercel sends it automatically. |
| Release pause | `SCHEDULED_TASKS_ENABLED` | Scheduled work runs only when the value is exactly `true`. Unset, `false`, whitespace and other values remain paused. Set `false` before building a production candidate; explicitly enable only after database and release checks pass. Changing the value requires redeployment. |
| Legacy scheduler migration | `COLLECTIONS_CRON_SECRET` | Optional compatibility token accepted by all three cron routes. Prefer the same value as `CRON_SECRET` during migration. Remove or rotate both values to fully revoke an old token. |
| Stripe API | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | Matching account/mode keys. Test keys cannot collect live payments. |
| Platform subscription webhook | `STRIPE_WEBHOOK_SECRET` | Signing secret for the platform endpoint described below. |
| Customer payment webhook | `STRIPE_CONNECT_WEBHOOK_SECRET` | Separate signing secret for the connected-account endpoint described below. |
| SaaS subscriptions | `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID` | Recurring prices belonging to the same Stripe account and mode as the secret key. Verify amounts and billing cadence in Stripe. |
| Subscription self-service | `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` | Optional `bpc_…` identifier for an active FieldClose-specific customer portal configuration in the same Stripe account and mode. Both billing entry points use it. Unset uses Stripe's account-wide default; when the account hosts other apps, configure FieldClose's cancellation/payment-update settings and legal links separately instead of changing their default. A malformed identifier fails closed. |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` | Verified sender domain and configured provider; required for password-reset delivery and customer email. |
| Error monitoring | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Approved FieldClose Sentry project destinations for server/edge and browser errors respectively. The browser destination is built into client assets; redeploy after changes. Empty values disable reporting. Actual event ingestion, alert receipt, and an assigned operator remain separate checks in the [monitoring and support runbook](monitoring-and-support.md). |
| Public support | `NEXT_PUBLIC_SUPPORT_EMAIL` | Set to the owner-approved `pegriollc@gmail.com` for this production deployment. A valid single email address is required; blank or invalid values fall back to `support@fieldclose.app`. Public pages, help content, policies, and billing recovery messages share this value. Rebuild after changing it. Inbox receipt, replies, and alert routing must be verified separately. |
| Proof-of-work photos | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | All four values and a private bucket with scoped Object Read & Write credentials. Keep public access disabled. App routes authorize image reads; `R2_PUBLIC_BASE_URL` is no longer used for new uploads. |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Optional; all are needed for outbound SMS. The auth token also verifies inbound signatures. |
| GitHub sign-in | `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | Optional OAuth application with callback URL configured for the deployment origin. |
| AI estimate drafting | `OPENAI_API_KEY` | Optional; without it, estimate drafting uses the local trade template. |
| Public trade defaults | `NEXT_PUBLIC_SERVICE_TRADE` | Optional public trade key. Organization-specific behavior comes from the organization's saved trade. |

Photos are limited to 4 MB per file in the API and both upload interfaces, leaving room for multipart overhead below Vercel's 4.5 MB function-body limit. On Vercel, missing or incomplete R2 configuration returns a clear 503 error without creating an asset or writing an ephemeral local file. Local development stores new photos outside `public`, under the ignored `.data/private-photos` directory. The browser sends and reads photos through the app; no browser R2 CORS or public domain is required. The server stores the image before recording it as uploaded and checks organization/job access or a valid customer portal token before proxying private bytes with `private, no-store` caching. Existing public URLs remain public until separately migrated; this change does not revoke them. Larger files require a future direct-to-storage flow. See [Vercel function limits](https://vercel.com/docs/functions/limitations) and the [email and private photo runbook](email-and-photo-storage.md).

## Stripe webhook setup

Register two Stripe snapshot event endpoints using API version `2025-02-24.acacia`, matching the SDK configuration. Each registered webhook endpoint has its own signing secret. See [Stripe's webhook endpoint API](https://docs.stripe.com/api/webhook_endpoints/create).

| Endpoint | Stripe event scope | Signing secret | Events |
| --- | --- | --- | --- |
| `/api/billing/webhook` | Platform account | `STRIPE_WEBHOOK_SECRET` | `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded` |
| `/api/stripe/webhook` | Connected accounts | `STRIPE_CONNECT_WEBHOOK_SECRET` | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated` |

Use the production application's HTTPS origin with each path. The common payment route also accepts platform-signed subscription events for compatibility with an existing combined configuration; it must not treat connected-account subscription events as FieldClose subscriptions. Configure the separate scopes and secrets above for a new installation.

Verify that signature verification succeeds and the expected invoice or subscription reconciles. Test and live endpoint secrets differ. Production payment readiness requires live keys, live prices, live-mode webhooks, and live Connect onboarding for each participating organization. Events from the opposite payment mode are ignored; test-mode delivery does not certify live payments.

## Scheduled jobs

`vercel.json` configures these daily jobs. Vercel invokes the production routes with **GET**, using UTC schedules and `Authorization: Bearer <CRON_SECRET>`. The routes also accept POST for existing external schedulers. They reject invalid or missing authorization with 401 and fail closed with 503 if neither supported secret exists. See [Vercel cron jobs](https://vercel.com/docs/cron-jobs) and [secret configuration](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

| Route | UTC schedule | Work |
| --- | --- | --- |
| `/api/recurring/generate` | Daily at 02:00 | Generate due recurring jobs and membership visits. |
| `/api/collections/run` | Daily at 03:00 | Process eligible configured invoice collection rules. |
| `/api/appointments/reminders` | Daily at 15:00 | Remind customers about jobs on the next calendar day in the organization's timezone. |

These expressions satisfy Hobby's once-per-day frequency restriction. Hobby execution may occur anywhere within the scheduled hour; they are daily workflows, not precise appointment timers. Higher frequency requires a compatible hosting plan or an external scheduler. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Deploy after changing secrets or schedules, and confirm the jobs appear in Vercel's cron settings. Avoid a second external scheduler running the same work. An authenticated manual trigger executes real work and may notify customers; it is not a harmless connectivity check.

Set `SCHEDULED_TASKS_ENABLED=false` before creating a staged production candidate, including one created without assigning the production domain. Do not assume domain assignment alone prevents scheduled execution. The shared guard authenticates first, then returns 503 without invoking any engine unless this flag is exactly `true`; missing or misspelled values cannot enable delivery. Enable with `true` only after the intended database is migrated and release checks pass, and create a new deployment so the setting takes effect. This flag does not change an already-running deployment's environment.

## Promotion checks

Before assigning the production domain, confirm the database resolves and accepts connections, all committed migrations are applied, the candidate serves protected application pages, and the configured integrations have passed their own checks. Keep the previous deployment available for recovery, with the database compatibility caveats in [the deployment guide](deployment-guide.md). `/api/health` is a core connectivity check, not an integration certification.

Before relying on public support links, verify the published support address routes to an owner-designated inbox and that a human can receive and reply. An outbound Resend sender does not establish an inbound mailbox. Complete the alert and support evidence in the [monitoring and support runbook](monitoring-and-support.md); configuration presence alone does not establish either service.
