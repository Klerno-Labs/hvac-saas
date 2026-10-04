# FieldClose deployment guide

The application and its integrated public marketing pages live in `app-scaffold/hvac-app`; a separate marketing template also remains available. Use Node.js 24.x and PostgreSQL; CI uses PostgreSQL 17. For Vercel settings, integration variables, and schedules, use [the Vercel runbook](deploy-vercel.md).

## Release sequence

1. Confirm the target project, canonical HTTPS origin, database owner, and environment. Preview and test deployments must use an isolated database and test payment credentials. Never put production credentials in committed files, build output, or screenshots.
   Set `SCHEDULED_TASKS_ENABLED=false` before building a staged production candidate. A candidate without a production domain must not be assumed ineligible for scheduled execution. The flag takes effect only in deployments created with that environment value.
2. Run `npm ci`, `npm run typecheck`, `npm test -- --run`, and `npm run build` from the application directory. Run `npm run test:integration` with `TEST_DATABASE_URL` set to a disposable PostgreSQL database. The integration suite creates and removes fixtures; do not point it at production.
3. Create a database backup and verify a restore path. Check `npx prisma migrate status` using the intended database connection. Review any schema drift and migration history before applying changes.
4. Apply the committed migrations with `npx prisma migrate deploy` in a controlled release step before promoting code that needs the new schema. The Vercel build generates Prisma Client but does **not** apply migrations. Do not run `prisma db push`, `migrate dev`, a reset, or a seed against production as a release shortcut.
5. Build a candidate deployment and verify it against the intended environment before assigning production traffic. A candidate using production credentials can still change production data: run smoke checks using dedicated, authorized fixtures and do not trigger customer messages or charges incidentally.
6. Promote the verified candidate, then complete the post-deploy checks below. Confirm the cron configuration after promotion.

A candidate may be built while the database is unavailable, but it must remain unpromoted and scheduled work must stay paused. After database migrations and release checks succeed, set `SCHEDULED_TASKS_ENABLED=true` and deploy with the updated environment before enabling the scheduled workflows. Only the exact value `true` enables execution; unset, `false`, and invalid values remain paused. A self-hosted service must restart to read a changed runtime environment.

For an existing database created with `db push`, do not assume it is already baselined. Reconcile its actual schema with the committed migration history and mark a migration applied only after confirming the schema really includes it.

## This release's compatibility changes

`0005_reconcile_product_schema` brings the original schema up to the current product models and changes subscription fields, including the subscription-status enum and removal of legacy columns. `0006_estimate_invoice_link` adds the estimate-to-invoice relationship. Review the SQL against the actual production schema and existing subscription data; applying these changes can make an older application release incompatible with the database.

Existing login sessions do not carry the new credential version. Users will need to sign in again when their old session is next checked. Keep `AUTH_SECRET` stable unless intentionally rotating it; the new session checks do not require changing that secret. Password resets now invalidate previously issued sessions.

## Runtime and self-hosting

For a conventional Node.js host, run the production build using `npm start`, behind HTTPS. Install dependencies with the lockfile, generate Prisma Client, and apply migrations through the same controlled release sequence. There is no maintained Dockerfile in this repository. [OVHcloud preparation templates](../deploy/ovh/README.md) provide a loopback-only systemd service and staged migration runbook; the service unit passes systemd validation on the provisioned Ubuntu host, while production cutover remains gated by the runbook. Set `DEPLOYMENT_ENV=production` on a non-Vercel production host to preserve live-payment and remote-photo-storage safeguards; use `preview` only for isolated staging.

Configure an external scheduler to call the three authenticated routes listed in [the Vercel runbook](deploy-vercel.md). Both GET and POST are supported; send `Authorization: Bearer <configured secret>`. Do not enable two schedulers for the same work. App and database logs should be retained by the hosting platform, with credentials redacted.

## Post-deploy verification

- Check `/api/health`. A 200 response verifies database connectivity and core environment presence only. It does not verify migration compatibility, email delivery, Stripe configuration, object storage, or scheduled-job execution.
- Confirm migration status, then sign in with a dedicated account and load dashboard, jobs, customer, estimate, and invoice pages. Check a technician account can access its assigned work but cannot open another technician's documents or organization-wide pricing lists.
- Create a test draft, convert an accepted estimate to a draft invoice, and verify the original monetary values. Verify a customer portal document in a private browser session.
- Verify email, photo storage, and payment webhooks in the appropriate test environment. A browser checkout redirect is not evidence of a paid invoice; verify webhook reconciliation and the resulting balance.
- Request each cron route **without** credentials and confirm 401 when configured. It should return 503 if neither supported secret is configured. An authenticated request executes real work and can send customer messages; use only an authorized execution and review scheduler logs.
- Check production logs and the next scheduled executions after promotion. A deployment that builds successfully is not evidence that integrations are configured.

## Rollback

Assess database compatibility before routing traffic back to an older build. A code rollback does not undo migrations or external payments/messages. If the previous application cannot use the migrated schema, restore through the reviewed database recovery plan or release a forward correction; do not run destructive SQL without assessing the data affected.

Verify health, protected pages, payment processing, and scheduler state again. Vercel's instant rollback does not automatically revert active cron schedules; inspect and reconcile them explicitly. See [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Monitoring

Monitor core health, database errors, application failures, Stripe delivery retries, email failures, storage errors, and scheduler outcomes independently. Review audit events under Settings > Audit. Keep an operational owner for failed background work; a successful HTTP response alone does not demonstrate a customer notification reached its destination.

Configure both server and browser Sentry destinations, then verify a sanitized event and an alert reaching the responsible person. The recovery screen remains usable when reporting is unavailable and never renders raw error details. Monitoring is not operational until ingestion, alert routing, and ownership are verified. See the [monitoring and support runbook](monitoring-and-support.md) for setup, current evidence, and support inbox verification.
