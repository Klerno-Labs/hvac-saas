# Production activation and verification

This records the September 26, 2026 service investigation. No successful local check establishes production readiness. The public domain still serves the earlier deployment; scheduled operational work remains paused for new candidates.

## Database decision

The owner does not know whether the unreachable original Supabase project contains real records. After the existing account could not locate it, the owner authorized starting over with a **separate empty database**. Preserve the original project reference `kcrwvvxhcncbemgvtodl` and the existing configuration history. No old data has been erased, recovered, or migrated.

The owner created the new project as **`fieldclose`**, reference **`lcdammkhivlabinxmzja`**, in the existing Pegrio Pro organization, East US (Ohio), Micro compute. The prepared form disabled Data API and automatic table exposure; the live connection dialog confirms Data API remains disabled. FieldClose uses server-side Prisma and does not need public Supabase REST table access. The dashboard lists Micro at approximately $10/month before credits; the owner completed the credential/hosting step. Provider status is Healthy and Table Editor shows no tables or views in `public`. No application migrations have been applied yet.

The original connection was preserved and re-read as encrypted production `LEGACY_DATABASE_URL` in the same Vercel project. The owner saved the new project's connection in production settings, but its password was rejected during guarded connection checks (`P1000`). The project reference, username and pooler addresses were independently matched against Supabase's connection dialog. No migration, seed or production deployment followed this failed check; existing deployments still contain the original connection.

The new project's password-reset form is prepared in Supabase, with the matching Vercel connection editor ready for the owner. The owner must complete the password reset, securely retain the new password, and save that same password in Vercel before another connection check. Never paste the password in chat or capture the populated field in a screenshot. The original inaccessible project's credential and records are not being reset.

After creation:

1. Verify a reachable PostgreSQL connection to the new project. Supabase's connection dialog specifies the transaction pooler `aws-0-us-east-2.pooler.supabase.com:6543` for runtime, username `postgres.lcdammkhivlabinxmzja`, database `postgres`, and `pgbouncer=true`; migrations use the session pooler at port `5432`. Store secrets directly in the existing FieldClose Vercel project, never in chat, source, screenshots or release logs. Preserve the old reference/configuration history before replacing the active connection. Keep scheduled work disabled.
2. Inspect the target in a read-only transaction. Confirm no FieldClose tables or migration history already exist. If they do, stop the fresh-install path and investigate rather than resetting.
3. Deploy the checked-in migrations to this verified empty target. Do not run `prisma db push`, development migrations, or the synthetic test seed against production.
4. Verify schema parity and a fresh owner signup/onboarding path using an owner-authorized business identity. Keep synthetic fixtures in the disposable test database.
5. Establish the backup schedule and demonstrate restoring a backup into an isolated target. Record retention, who can recover it, and the measured restoration outcome.
6. Build a protected candidate, verify its database and protected workflows, then complete provider checks before assigning live traffic.

## Read-only provider audit

Run from `app-scaffold/hvac-app` with Node 24 and an explicitly supplied process environment:

```sh
node scripts/check-provider-services.mjs
```

The command does not load environment files automatically. It uses only provider reads: Stripe account/prices/webhooks/portal, Resend sender-domain status, and R2 `HeadBucket`. It does not send messages, create checkouts, make charges, upload objects, or inspect customer records. It emits statuses without credentials or raw provider errors. Restricted keys can produce `unverified`; do not broaden application permissions merely to turn a diagnostic green.

`passed` applies only to the named configuration/read check. Webhook account scope, installed signing secrets and actual processing still require delivery verification. A reachable bucket does not prove write permissions or privacy. A verified sender does not prove inbox delivery. The command always leaves the end-to-end gate unverified and returns a nonzero exit status until all listed prerequisites have separate evidence; it is not an automated launch certification.

Stripe webhook payload versions must match the server's pinned API contract. The API list response does not reliably establish platform versus connected-account scope; review it in Stripe and verify signed deliveries. References: [Stripe webhook endpoints](https://docs.stripe.com/api/webhook_endpoints), [Resend domains](https://resend.com/docs/api-reference/domains/list-domains).

See [live payments](live-payments-activation.md), [current blockers](known-issues.md), and the release receipt for current evidence. Production activation also requires a supported email sender, private photo storage, actual monitoring/alert receipt, and an operational owner for unresolved payment/delivery/support exceptions. Advertising and paid acquisition remain unlaunched; this work does not authorize ad spend or customer outreach.
