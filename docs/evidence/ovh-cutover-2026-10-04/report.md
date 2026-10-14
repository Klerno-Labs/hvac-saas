# OVH production cutover preparation — October 4, 2026

Status: **prepared; public DNS and production traffic have not moved**. The existing Vercel deployment and its three scheduled jobs remain active. No paid SEO tool or advertising was purchased.

## Completed evidence

- A fresh read-only snapshot of the existing encrypted production database restored into a disposable local PostgreSQL database. All 37 application tables, 51 rows, ten migration records, logical schema definitions and row-content digests matched. The temporary restore database was removed. The backup remains outside Git with owner-only permissions. See `backup-restore.json`.
- OVH has a separate non-login production user, protected configuration directory, inactive application service and inactive scheduler units. Synthetic staging remains isolated and unchanged. No production runtime credentials were installed and no production service or timer was started. See `runtime-preparation.json`.
- A fresh Linux production-origin build of `763b859` is installed at `/srv/fieldclose-production/releases/763b859` without an active production link. Build, pruning and guarded synthetic startup passed; 24 sitemap URLs, 23 static canonical artifacts and zero runtime vulnerabilities were verified. Real production-provider verification remains pending. See `production-build.json`.
- Existing Stripe account and connected-account destinations were inspected; their two distinct signing secrets were recovered privately. Twenty existing configuration settings were recovered without printing or committing values. The new restricted Stripe runtime key and bucket-only R2 credentials are prepared in provider forms, pending action-time approval. See `provider-preparation.json`.
- The existing R2 bucket has public access disabled, no custom domain and no public development URL. Its existing objects were not modified.
- The existing owner browser session successfully opened the protected production dashboard before migration. Exact authentication-secret bytes, including a trailing newline, must be preserved. A dummy multiline environment fixture verified that systemd preserves that newline without displaying any actual secret.
- Deployment guard and scheduler response validation have 24 passing tests. Incomplete/malformed counters and whitespace-only authentication secrets fail validation. The deployment tests are included in CI.
- Search Console access to the verified `https://fieldclose.app/` property works. Its current successful sitemap was last read October 2 and contains 17 discovered pages. The new 24-page sitemap has **not** been submitted because it is not public yet.

## Remaining cutover sequence

1. Obtain the pending approval, create the prepared restricted credentials, and save them only to protected OVH production configuration. Preserve existing credentials for rollback; do not alter unrelated Pegrio resources.
2. Verify the production candidate against the real encrypted database and providers with scheduled work paused. Read-only provider checks, signed ignored webhook probes and an isolated newly created/deleted storage canary do not make a real charge or send customer messages. Signed local probes do not establish Stripe-origin delivery.
3. Obtain the apex/www certificate through DNS-01, activate the separate nginx production vhost, and verify HTTPS directly against the OVH address before changing public DNS.
4. Disable the actual Vercel cron feature, verify it is stopped, then change only the intended apex/www records. Keep the previous deployment available for rollback. Enable exactly one set of scheduled jobs after public checks pass; do not manually execute live reminders as a smoke test.
5. Convert the new certificate lineage to automatic webroot renewal and verify a persisted-config dry run. Check public routes, cache/crawler boundaries, existing-session continuity, provider behavior and release identity.
6. Submit the publicly verified 24-page sitemap in Search Console and retain its receipt. Submission is not proof of indexing, rankings or traffic.

The operational commands and rollback sequence are in `deploy/ovh/production/README.md`. Provider/browser credentials remain in protected temporary files outside the repository while approval is pending. This preparation is not a completed public cutover or a certification of unrestricted capacity or unattended operation.
