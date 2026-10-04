# Parallel OVH production deployment

Prepared October 4, 2026. These are inactive templates. Installing files does not authorize starting scheduled work, changing DNS or transferring credentials. Preserve the existing synthetic staging service throughout production cutover.

## Current host and separation

| Item | Existing synthetic staging | New production target |
| --- | --- | --- |
| Service/user | `fieldclose.service` / `fieldclose` | `fieldclose-production.service` / `fieldclose-prod` |
| Listener | `127.0.0.1:3000` | `127.0.0.1:3001` |
| Release link | `/srv/fieldclose/current` | `/srv/fieldclose-production/current` |
| Releases | `/srv/fieldclose/releases/` | `/srv/fieldclose-production/releases/` |
| Environment | `/etc/fieldclose/app.env` | `/etc/fieldclose-production/app.env` |
| Database | synthetic PostgreSQL on `127.0.0.1:56487` | existing encrypted Supabase connection |
| Photos | no provider credentials | existing private R2 bucket and records |
| Public host | gated `staging.fieldclose.app` | `fieldclose.app`, `www` redirects to apex |

The existing `fieldclose.service.d/isolated-test.conf` adds the outbound provider guard. Leave it, staging Basic Auth, staging noindex headers, its database and its release link unchanged. Production gets its own Unix user, secrets directory and cache so the synthetic service cannot read production credentials. Do not copy `.env*` files, macOS dependencies, synthetic data or test Stripe keys into the production release.

Production is limited to 4 GiB process-group memory and a 2 GiB Node heap on the 8 GiB host. This is a resource boundary, not a new capacity benchmark. Avoid load tests or overlapping builds during cutover.

The host has both IPv4 and IPv6. The production service uses `--dns-result-order=ipv4first --no-network-family-autoselection`; Node 24 was verified to reach the R2 endpoint from IPv4 `40.160.36.160`. Use the same flags for provider probes when the R2 token is limited to that IPv4 address. The env file must not override `NODE_OPTIONS` with conflicting values. Do not expand token scope just to accommodate unconfigured IPv6 behavior.

## Candidate preparation

1. Record the current apex/www DNS values, Cloudflare proxy/TLS state, existing Vercel production deployment and active scheduler configuration. Keep the current public deployment available for rollback. Obtain a fresh encrypted production database backup, restore it into a separate disposable local target, and record table/schema/row checksums. OVH snapshots of the synthetic VPS do not protect the remote Supabase database. No migration or schema change is needed for the SEO/attribution release.
2. Create the non-login `fieldclose-prod` user and directories only after coordinating with the operator. Use root ownership, group `fieldclose-prod`, mode `0750` for `/etc/fieldclose-production`; runtime and scheduler env files must be `0640`. Keep recovered secret values out of command arguments, source, terminal output and Git. Preserve the existing `AUTH_SECRET`, live database, private R2 bucket, Stripe account/prices/webhook signing secrets and sender configuration. Privately compare `AUTH_SECRET` and `DATABASE_URL` with the approved existing values before transfer; the startup guard checks URL shape, not which Supabase project owns the records. The guard rejects placeholder/whitespace-only signing keys without trimming valid keys.
3. Runtime origin values are `APP_URL=https://fieldclose.app`, `AUTH_URL=https://fieldclose.app`, `AUTH_TRUST_HOST=true`, `DEPLOYMENT_ENV=production`. Any `NEXTAUTH_URL` or `NEXT_PUBLIC_APP_URL` must match. Start with `SCHEDULED_TASKS_ENABLED=false`. Do not enable the Vercel Analytics build flags on OVH. Install the approved live provider credentials securely into the production env file; never into staging.
4. Extract a pinned Git archive into a separate build directory. Copy only the approved production env to a protected file outside the app. Run a fresh Linux `npm ci --include=dev`, then `node --env-file=/protected/build.env node_modules/next/dist/bin/next build`. Use `NEXT_TELEMETRY_DISABLED=1` and the IPv4 Node flags during build/provider probes. Run `npm prune --omit=dev --ignore-scripts`, runtime audit and the production-only startup smoke. Confirm no `typescript`, `shadcn`, `braces` or `micromatch` runtime package remains. The release must be built with the production origin; staging's generated HTML cannot be reused.
5. Install the built app under `/srv/fieldclose-production/releases/<revision>` owned by root. Create `.next/cache` owned by `fieldclose-prod` and writable only by that user. Point the production `current` link at this release. Install the env guard at `/usr/local/lib/fieldclose/production-env-check.mjs` owned by root. Install and verify the production service template. Start only this service, leaving all timers disabled. Its guard checks configuration shape and environment boundaries; it does not establish provider connectivity or key permissions.
6. Verify loopback health, schema/migration compatibility via the read-only readiness script, live Stripe account/prices/webhook configuration, and existing R2 metadata/object reads. Authorized isolated fixture operations must be explicitly identified; no real charge or customer communication is an incidental smoke check. Verify unauthorized cron rejection and paused behavior while the actual process has `SCHEDULED_TASKS_ENABLED=false`.

## TLS and routing

Obtain a trusted certificate containing `fieldclose.app` and `www.fieldclose.app` before public DNS changes, preferably through an authorized DNS-01 challenge. The template expects `/etc/letsencrypt/live/fieldclose.app/{fullchain,privkey}.pem`. The existing staging certificate covers only staging and cannot be used for the apex. Preserve the working renewal timer/reload hook and verify renewal for the new certificate.

Copy `nginx-production.conf` to `/etc/nginx/sites-available/fieldclose-production` and create its `sites-enabled` link only after certificate and loopback checks pass. Do not replace the existing default/staging site. Run `nginx -t` before reloading. Test public-origin HTTPS directly against `40.160.36.160` using SNI/Host override (`curl --resolve fieldclose.app:443:40.160.36.160 https://fieldclose.app/`) while normal DNS still serves the previous host. The production vhost preserves Authorization headers; staging deliberately strips its Basic Auth credentials.

Verify all 24 sitemap URLs, index/follow on public marketing pages, same-path apex canonicals, private-route noindex/no-store and login protection, HTTPS/www redirects, metadata and static cache output. Check both unsigned Stripe webhook requests fail without side effects. Verify monitoring ingestion and authorized production fixture workflows before moving DNS.

## Single scheduler transition

No FieldClose scheduler or application backup job existed on this VPS at the October 4 audit. Existing Vercel scheduled execution was last recorded enabled. First disable and verify the old scheduler; merely saving a Vercel env change does not alter an active deployment. DNS changes alone do not stop an old deployment's cron.

The scheduler units supplied here are inactive until explicitly enabled. Install the root-owned runner at `/usr/local/lib/fieldclose/run-scheduled.mjs` and copy the `.service`/`.timer` files into systemd. The separate protected `scheduler.env` contains only the chosen existing cron bearer secret, `DEPLOYMENT_ENV=production` and `SCHEDULED_TASKS_ENABLED=false` during preparation. No provider/database credentials are necessary for the runner. A readiness probe must not call it: authenticated enabled requests execute real work.

After production and provider checks pass and the old scheduler is confirmed stopped, set the production process and scheduler env flags to `true`, restart the production service, and enable exactly these timers:

| Timer | UTC time | Route |
| --- | --- | --- |
| `fieldclose-recurring.timer` | 02:00 daily | `/api/recurring/generate` |
| `fieldclose-collections.timer` | 03:00 daily | `/api/collections/run` |
| `fieldclose-appointments.timer` | 15:00 daily | `/api/appointments/reminders` |

They use nonpersistent schedules, per-task locks and no automatic retries. A timeout can mean partial delivery; inspect state before any manual replay. The runner requires the task's complete response counters as nonnegative safe integers and treats missing/malformed counts, HTTP 200 with `success:false`, or nonzero `errors`/`needsReview` as failure. Recurring membership visits cannot exceed total generated jobs. Logs contain only fixed status and validated numeric counters. Review the first actual scheduled outcome and establish a missed-run monitor; application Sentry failure reporting does not detect an execution that never starts. A timer definition alone is not proof of monitoring or successful delivery.

## Cutover and rollback

After candidate, provider, backup and HTTPS checks pass, update only the intended apex/www DNS records; leave staging DNS unchanged. Verify the public origin from outside OVH, release identity, all public URLs, production login, provider callbacks, scheduler state and support/monitoring. Submit `https://fieldclose.app/sitemap.xml` through the verified Search Console property only after the public 24-URL sitemap is confirmed. Search Console submission is not an indexing or traffic guarantee.

If production verification fails, stop OVH timers first and wait for or inspect any active scheduled task. Restore the recorded DNS records to the retained public deployment. Restore exactly one scheduler after confirming which environment is serving work. This release changes no database schema, so existing database/R2 records remain the shared source of truth; do not restore an older database snapshot merely to roll back app code. Never point the public origin at synthetic staging.

For later OVH code rollbacks, atomically switch only `/srv/fieldclose-production/current` to a verified production-built release, restart `fieldclose-production`, and check health/auth/providers. Existing staging releases are not production rollback candidates because their embedded origins and environment boundaries differ.

## Preparation checks

Run `node --test deploy/ovh/production/safety.test.mjs`. Validate units using the target Ubuntu host's `systemd-analyze verify` before installation. Validate nginx only when the production certificate paths exist. None of these templates purchases services, creates credentials, issues certificates, changes DNS, installs timers or starts jobs automatically.
