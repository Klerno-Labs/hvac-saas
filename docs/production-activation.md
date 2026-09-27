# Production activation and verification

This records the September 26, 2026 service investigation. No successful local check establishes production readiness. The public domain still serves the earlier deployment; scheduled operational work remains paused for new candidates.

## Database decision

The owner does not know whether the unreachable original Supabase project contains real records. After the existing account could not locate it, the owner authorized starting over with a **separate empty database**. Preserve the original project reference `kcrwvvxhcncbemgvtodl` and the existing configuration history. No old data has been erased, recovered, or migrated.

The owner created the new project as **`fieldclose`**, reference **`lcdammkhivlabinxmzja`**, in the existing Pegrio Pro organization, East US (Ohio), Micro compute. The prepared form disabled Data API and automatic table exposure; the live connection dialog confirms Data API remains disabled. FieldClose uses server-side Prisma and does not need public Supabase REST table access. The dashboard lists Micro at approximately $10/month before credits; the owner completed the credential/hosting step.

The original connection was preserved and re-read as encrypted production `LEGACY_DATABASE_URL` in the same Vercel project. The owner's corrected production connection now authenticates successfully. The project reference, username and pooler addresses were independently matched against Supabase's connection dialog. A read-only transaction confirmed PostgreSQL 17.6 and an empty `public` schema, including no application tables, views, sequences or enums, before any migration was run.

All ten checked-in migrations were then applied with `prisma migrate deploy` over the session pooler. Runtime transaction-pooler inspection passes connectivity, required columns, unique keys and migration checksums. Migration status is current and Prisma reports no schema drift. No seed, customer, owner account or payment record was inserted during migration. The owner subsequently completed account creation and authorized the internal verification records documented below. The unused password reset form was closed after the corrected password worked; no agent password reset was performed. Existing deployments retain their captured environment until a new candidate is built.

With the owner's explicit approval, Supabase SSL enforcement was enabled and its brief database restart completed. The dashboard confirms enforcement is on, and the encrypted connection was successfully rechecked afterward. The runtime and maintenance URLs require SSL. No network restriction was added without verified Vercel egress addresses.

### Backup and restore evidence

A post-migration public-schema logical backup was taken using a read-only exported snapshot and restored into a new, explicitly guarded local PostgreSQL database, separate from the test suite database. All 37 tables (36 application tables plus Prisma history), ten migration names/checksums, schema/constraints/indexes/enums and row counts matched. Every application table contained zero rows. Restored Prisma migration status was current, and schema diff found no difference. The measured dump took about 11 seconds and local restore about 0.1 seconds; these empty-database times do not predict recovery time with customer data.

The checked archive and receipt are retained outside the repository in the owner's private `~/Library/Application Support/FieldClose/backups/` directory (directory `0700`, files `0600`). Archive `fieldclose-lcdammkhivlabinxmzja-2026-09-27T02-24-42-598Z.dump` has SHA-256 `c026c0ce2f7a676f85b7e4b824920815ce8a200b6d190e75074199465b9666d6`. This backup excludes managed Supabase schemas, role ownership/grants and photo objects. It proves restoration of the new empty application's schema/history, not recovery of the unavailable original project or a production rollback.

Supabase's dashboard separately shows a daily physical backup at **2026-09-27 01:39 UTC**, before the application migrations. The project is on Pro; Supabase documents seven days of daily backup retention. That managed snapshot was not restored during this verification, and it must not be described as a post-migration backup. No paid point-in-time recovery add-on was enabled. Verify ongoing managed backups as customer data is introduced, keep storage recovery separate, and establish an authorized responder for recovery. See [Supabase backups](https://supabase.com/docs/guides/platform/backups).

After creation:

1. Verify a reachable PostgreSQL connection to the new project. Supabase's connection dialog specifies the transaction pooler `aws-0-us-east-2.pooler.supabase.com:6543` for runtime, username `postgres.lcdammkhivlabinxmzja`, database `postgres`, and `pgbouncer=true`; migrations use the session pooler at port `5432`. Store secrets directly in the existing FieldClose Vercel project, never in chat, source, screenshots or release logs. Preserve the old reference/configuration history before replacing the active connection. Keep scheduled work disabled.
2. Inspect the target in a read-only transaction. Confirm no FieldClose tables or migration history already exist. If they do, stop the fresh-install path and investigate rather than resetting.
3. Deploy the checked-in migrations to this verified empty target. Do not run `prisma db push`, development migrations, or the synthetic test seed against production.
4. Verify schema parity and a fresh owner signup/onboarding path using an owner-authorized business identity. Keep automated synthetic fixtures in the disposable test database. Any manual production verification records require explicit owner authorization and clear internal-test labels.
5. Establish the backup schedule and demonstrate restoring a backup into an isolated target. Record retention, who can recover it, and the measured restoration outcome.
6. Build a protected candidate, verify its database and protected workflows, then complete provider checks before assigning live traffic.

### Owner onboarding verification

The owner completed signup and signed into the protected `7878c6f` candidate. The saved Pegrio workspace is HVAC, uses `America/Chicago`, and has one owner with an active Pro trial. The owner explicitly chose an **internal verification workspace**, authorizing clearly labeled fictional records rather than real customer work.

Using the application UI, one fictional customer with a reserved example phone number and no email, one $125 diagnostic service, one unscheduled draft job and draft estimate `EST-0001` were saved. The estimate selected the saved service, retained quantity 1, zero tax and a $125 total, and explicitly states that it is not a commercial offer and no payment is due. The generated one-page PDF was downloaded and visually checked. The setup page confirms **4 of 7 required steps complete**: business, customer, priced service and job. The draft is not counted as sent.

No customer message, dispatch, invoice, charge, subscription purchase or connected financial account was created during this verification. The remaining checklist steps require an issued estimate, verified live payment setup and a real webhook-confirmed customer payment. They must not be fabricated to complete the progress indicator. Optional team invitations were skipped for this one-owner workspace.

Document delivery remains paused: `APP_URL` still points to `https://fieldclose.app`, which serves the earlier deployment with the unavailable original database. An emailed portal link would therefore target the wrong deployment. Keep the sample estimate in draft until the intended customer origin is verified; the successful protected-candidate PDF download does not prove customer-link delivery.

A second read-only snapshot after onboarding was exported and restored into a **new** isolated local database. All 37 tables, ten migrations and 27 total rows (17 application rows) matched the source snapshot by both counts and per-table SHA-256 checksums of canonical row content. Schema and migration history matched, Prisma status was current and schema diff was empty. The receipt contains aggregate counts/checksums, not private row contents. Archive `fieldclose-lcdammkhivlabinxmzja-post-onboarding-20260927025038.dump` (109,002 bytes; SHA-256 `a523ab1428ffa47fad486ab32c985f59482f5eec263838e4cb8a37898838a3b3`) and its restore receipt are retained in the private backup directory with `0600` permissions. The earlier empty backup was rechecked unchanged. This extends recovery evidence to the newly saved workspace; it still excludes managed Supabase schemas, role ownership/grants and photo objects, and does not prove recovery of the unavailable original database. The local archive is protected by filesystem permissions, but it is not separately encrypted or copied off-site.

## Read-only provider audit

Run from `app-scaffold/hvac-app` with Node 24 and an explicitly supplied process environment:

```sh
node scripts/check-provider-services.mjs
```

The command does not load environment files automatically. It uses only provider reads: Stripe account/prices/webhooks/portal, Resend sender-domain status, and R2 `HeadBucket`. It does not send messages, create checkouts, make charges, upload objects, or inspect customer records. It emits statuses without credentials or raw provider errors. Restricted keys can produce `unverified`; do not broaden application permissions merely to turn a diagnostic green.

`passed` applies only to the named configuration/read check. Webhook account scope, installed signing secrets and actual processing still require delivery verification. A reachable bucket does not prove write permissions or privacy. A verified sender does not prove inbox delivery. The command always leaves the end-to-end gate unverified and returns a nonzero exit status until all listed prerequisites have separate evidence; it is not an automated launch certification.

Stripe webhook payload versions must match the server's pinned API contract. The API list response does not reliably establish platform versus connected-account scope; review it in Stripe and verify signed deliveries. References: [Stripe webhook endpoints](https://docs.stripe.com/api/webhook_endpoints), [Resend domains](https://resend.com/docs/api-reference/domains/list-domains).

See [live payments](live-payments-activation.md), [current blockers](known-issues.md), and the release receipt for current evidence. Production activation also requires a supported email sender, private photo storage, actual monitoring/alert receipt, and an operational owner for unresolved payment/delivery/support exceptions. Advertising and paid acquisition remain unlaunched; this work does not authorize ad spend or customer outreach.
