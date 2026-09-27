# OVHcloud test deployment

Prepared order: one VPS-2 2027, US-EAST-VA, 4 vCore, 8 GB RAM, 75 GB NVMe, Ubuntu 24.04, no commitment and no paid options. The checkout summary on September 27, 2026 is **$10/month before tax**. The $8.50 headline uses a 12-month commitment. Tax requires account identification. Standard daily backup is included as a displayed $0.60 promotion; verify its renewal treatment before purchase. No purchase or server provisioning has occurred.

These are preparation templates, not evidence that an OVH server is running. Do not install the service before the prerequisites below are met.

## Isolated candidate

1. Confirm checkout total, renewal/cancellation terms and standard backup pricing; obtain approval before purchase. New account credentials are entered directly by the owner.
2. Provision Ubuntu 24.04 in the selected U.S. region. Establish authorized SSH access, verify its host key through the provider console and retain recovery access. Configure OS updates and a firewall; expose only authorized SSH and HTTPS/HTTP, never PostgreSQL or the application's private port.
3. Install Node 24 from its official source. Confirm its executable is `/usr/bin/node` before using the supplied service. Create a dedicated non-login `fieldclose` service user. Deploy a pinned Git revision into `/srv/fieldclose/releases/<revision>` and install dependencies from the lockfile on Linux. Do not copy macOS `node_modules`, `.env*`, user uploads or Vercel credentials.
4. Use an isolated PostgreSQL test database, synthetic users and sandbox payment credentials. Keep all real email/SMS delivery disabled. Production credentials must not be copied into staging. Apply the committed migrations to that test database and run the release checks before enabling the service.
5. Build with the staging canonical HTTPS URL and explicitly supplied public build variables. Configure TLS/reverse proxy for that one host; forward the original Host and HTTPS scheme. Bind the application to loopback as shown. Limit upload request bodies to an appropriate bound above the app's 4 MB per-file allowance (for example 6 MB). Do not log query strings, cookies, authorization headers or request bodies: portal/review/reset links are sensitive.
6. Set `/srv/fieldclose/current` to the built release. Create `.next/cache`, owned by the service account, before installing `fieldclose.service`; the rest of the release should not be writable by that account. Store secrets outside releases in `/etc/fieldclose/app.env` with root ownership, fieldclose group and mode 0640. Validate the unit on the actual Ubuntu host with `systemd-analyze verify`, then install/start it. Log rotation and disk-use limits must be configured before pressure testing.
7. Test real sign-in, tenant/role boundaries, private photos, PDFs, estimate-to-invoice workflow, sandbox payment notifications, restart/recovery and a bounded load run. Record memory/CPU and tail latency on the actual VPS. Neither the local build nor a systemd template establishes hosted capacity.

## Production cutover gates

- Keep existing production and DNS unchanged until candidate tests pass and rollback is prepared.
- Keep the production database and private R2 bucket; do not perform an incidental database migration. Verify a current recoverable backup before touching production.
- Set `DEPLOYMENT_ENV=production` for the final runtime. This rejects test Stripe keys and refuses local photo storage, independently of Vercel-specific environment variables. Keep the existing `AUTH_SECRET` and canonical `https://fieldclose.app` origin to preserve appropriate session behavior.
- Transfer the approved production environment securely without printing values or embedding them in images or source. Rebuild for the final public settings as required by Next.js. Validate the complete environment inventory, including Stripe prices, distinct webhook secrets, email, monitoring and scheduler secrets; the sample file is deliberately incomplete.
- Keep `SCHEDULED_TASKS_ENABLED=false` until a single scheduler is installed and validated. Vercel cron definitions do not follow a DNS move. Disable the old schedule before enabling the replacement; do not run both. Retain the three documented daily schedules, authenticated requests, failure-count inspection and missed-run alerting.
- Verify TLS, exact release identity, public health, webhook signature rejection, authorized app workflows and rollback after DNS cutover. Do not delete the old deployment until the observation period and rollback plan are complete.

No automated host purchase, OS install, secret transfer, DNS modification or production scheduler action is performed by these files. The VM's included daily snapshot is not a replacement for tested database backups with a suitable retention policy.

## Local preparation verification

The host-independent payment/storage changes passed 1,459 unit tests, type checking and an isolated production build. Four added cases verify test-key rejection, live-key acceptance, preservation of the Vercel production boundary and refusal of local photo reads/writes on a declared non-Vercel production host. The service unit still needs validation on the actual Ubuntu host; no hosted test or migration has occurred.
