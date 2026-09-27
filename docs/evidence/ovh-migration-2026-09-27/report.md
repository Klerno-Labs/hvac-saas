# FieldClose OVH staging verification — September 27, 2026

Production traffic has **not moved**. Staging DNS and HTTPS verification are complete. Provider validation on the new host, production secret transfer, single-scheduler cutover, backup/rollback validation and final DNS promotion remain outstanding. Vercel API access currently returns HTTP 403 and the browser requires sign-in to recover the existing production configuration. High-concurrency latency is a launch constraint, despite no functional failures in this run.

## Host

OVH order 8987764, VPS-2 2027, US-EAST-VA, Ubuntu 24.04, 4 vCore, 8 GB RAM, 75 GB NVMe. Checkout $10.66/month including tax; standard-backup discount is promotional. Possible renewal without that discount is about $11.30 at the current tax rate. Other service bills remain separate.

Owner completed initial password change and approved persistent deployment-key access. Server fingerprint verified via provider console. SSH key works; remote password/root login disabled. Firewall exposes SSH, HTTP and HTTPS only. PostgreSQL and app ports are loopback-only. Automatic security updates and fail2ban enabled. Journals limited to 256 MB persisted, 64 MB runtime, 14-day retention. App runs as non-login fieldclose account with read-only system protection and 6 GiB process-group memory cap. Environment is root-owned/group-readable only, outside the release directory.

## Code and checks

Application revision 725b07c95d48fbf16dc650499e2777ef113ce289. Node 24.21.0 downloaded from official Node distribution and checksum verified; npm 11.9.0; PostgreSQL 16.15. Linux lockfile installation and optimized production build passed. All **134 database integration tests** passed. Service unit passed systemd validation and private health returned 200 with database/auth/environment healthy. Stripe is deliberately not configured in persistent private staging.

## Pressure methodology

Separate synthetic database with ten organizations, 100 employees, 180,000 historical jobs spanning three years, plus current synthetic work. This is generated history and a short pressure test, not three years of uptime. Compiled Next server and database run together on the actual OVH VPS. Requests originate on the VPS, so these times exclude user Internet latency and the future HTTPS proxy. Outbound provider HTTP is blocked. Payment events are locally signed synthetic fixtures, not actual Stripe charges or delivery verification. No production secrets or customer records were copied.

**9,132/9,132 expected HTTP outcomes passed; all 9 workflow/integrity checks passed.** No detected tenant marker leaks, historical balance corruption, duplicate collection, pool/OOM markers, or process crash. Peak Next process resident memory was **1166 MiB** (not whole-machine usage).

| Phase | Requests | Failures | P95 | P99 |
|---|---:|---:|---:|---:|
| warmup | 224 | 0 | 0.46 s | 0.50 s |
| burst-10 | 558 | 0 | 0.73 s | 0.93 s |
| burst-25 | 619 | 0 | 1.66 s | 2.09 s |
| burst-50 | 660 | 0 | 2.84 s | 3.10 s |
| burst-100 | 689 | 0 | 5.20 s | 5.51 s |
| burst-200 | 676 | 0 | 11.48 s | 11.93 s |
| sustained-100 | 3,751 | 0 | 4.44 s | 5.33 s |
| recovery-10 | 475 | 0 | 0.30 s | 0.72 s |

At 100 sustained concurrent simulated employees, requests ran continuously with 500 ms think time. The 200-request burst deliberately exceeds that workload. Throughput plateaued around 30–33 requests/second, indicating saturation. Passing integrity tests does not establish acceptable speed at arbitrary load; high-concurrency performance must improve or launch traffic must be constrained. Do not call this unrestricted production readiness.

Raw fixture and pressure summaries accompany this report. A full host reboot passed: FieldClose, PostgreSQL and fail2ban restarted automatically, health returned 200 with the database healthy, the firewall remained active, and systemd reported no failed units. Recovery output is in recovery.log.

## HTTPS staging verification

`staging.fieldclose.app` resolves directly to the OVH host. A Let’s Encrypt certificate is installed, with an enabled renewal timer and nginx reload hook. A certificate-renewal dry run passed against Let’s Encrypt staging. HTTP redirects to HTTPS. Staging requires an additional authentication gate and sends no-index headers. Production apex and www DNS remain unchanged.

Five external HTTPS boundary/health checks passed. Twelve synthetic-user authentication and protected-route checks passed, including a secure session cookie, correct session identity, dashboard, jobs, customers, estimates, invoices, calendar, field, reports and settings. These are HTTP/session checks, not a complete interactive browser acceptance test. Provider credentials remain absent and outbound provider HTTP remains blocked in this synthetic environment.

## Request-scoped session optimization

The page, navigation and trial banner now share authentication and membership reads within one React server render. No cross-request session or role cache is introduced. Type checking, all 1,459 unit tests, and the Linux production build passed.

A second actual-VPS run completed 11,673/11,673 expected HTTP outcomes without tenant leaks or detected provider/pool errors. Sustained-100 throughput was 39.38 requests/second versus 30.61 before (about 29% higher); P95 was 3.67 seconds versus 4.44 (about 17% lower). These sequential runs are directional evidence, not a controlled statistical benchmark; warmed database caches and accumulated synthetic records can affect results. Heavy-load latency remains a launch constraint.

The new role-revocation assertion initially expected a direct redirect to Field, while the app correctly redirects via Dashboard. That assertion was corrected to verify both hops. A focused follow-up passed all 11 requests, including role revocation and password-change session invalidation on the next request. The original result retains this failed test expectation for transparency; see ovh-session-revocation.json for the corrected check. The pressure runner now exits unsuccessfully when any check fails, even if expected HTTP statuses pass.
