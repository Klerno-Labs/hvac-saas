# Rate Limiter

A thin sliding-window rate limiter for auth and portal routes. Backed by Upstash Redis when available; falls back to the Prisma DB store otherwise.

## Buckets

| Bucket | Purpose | Window | Max hits |
|---|---|---|---|
| `auth-login` | Credential login attempts (per-IP) | 15 min | 10 |
| `auth-reset` | Password-reset requests (per-IP) | 60 min | 5 |
| `portal-access` | Customer portal token use (per-IP) | 15 min | 20 |
| `auth-signup` | New account creation (per-IP) | 60 min | 5 |

Keys passed to `limit()` must be hashed or anonymised — never raw IPs, emails, or tokens.

## Usage

```ts
import { limit } from '@/lib/rate-limit'

const result = await limit(`auth-login:${hashedIp}`, { windowMs: 15 * 60_000, max: 10 })
if (!result.allowed) {
  // return 429 with Retry-After: result.retryAfterSeconds
}
```

## Store selection

| Env vars present | Store used |
|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis (preferred) |
| Neither | Prisma `RateLimitHit` table (DB store) |

## DB store maintenance

The `RateLimitHit` table is append-only and pruned by a cron job. Configure the cron schedule in `vercel.json` — it is already set to run hourly against `/api/internal/rate-limit-prune`.

The prune route requires the `CRON_SECRET` env var to be set. The `x-cron-secret` request header must match it exactly (Vercel cron sends it automatically when configured).

## Fail-open behaviour

If the backing store is unreachable, `limit()` **returns `allowed: true`** rather than throwing. This ensures a limiter outage can never block user logins or payment flows.

Each degraded call increments an internal `storeErrorCount` counter and emits a structured `console.warn` (no secrets or user identifiers). Monitor for `[rate-limit] store error` log lines and alert if `storeErrorCount` climbs.

## Env vars

| Name | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash REST endpoint (opt-in to Redis store) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash auth token |
| `CRON_SECRET` | Shared secret for the prune cron route |
