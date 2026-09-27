# Hosting alternatives — September 27, 2026

## Updated owner decision

The owner subsequently rejected Railway as well, citing unpredictable extra charges, and authorized preparing an OVHcloud VPS-2 test. The reviewed month-to-month checkout is **$10 before tax**, not the advertised $8.50 (which requires twelve months). Prepared: one US-EAST-VA VPS, Ubuntu 24.04, no paid options. The owner purchased order 8987764 at $10.66 including tax, and OVH delivered the server. The backup discount is promotional; allow about $11.30 including current tax if it ends. Isolated host testing is in progress; production traffic has not moved. See [OVH preparation](../deploy/ovh/README.md). The comparison below is retained as historical research, not the current recommendation.


The owner explicitly rejected paying Vercel and authorized comparison of lower-cost hosting. No replacement purchase, deployment, DNS change, credential transfer or spending-limit change is authorized by this comparison alone. Existing production remains available while a replacement is evaluated.

## Verified existing account

Railway CLI access works. Read-only API inspection confirms Christopher’s Projects is already on the HOBBY plan and contains two existing projects. The customer usage-limit field is null: no configured usage limit was returned. Do not alter or reuse those projects without checking their purpose. No Railway infrastructure was created or changed.

## Practical comparison

- **Railway:** easiest candidate to test, because the app uses standard Node 24 and PostgreSQL. The existing Hobby workspace means another platform subscription should not be needed for a new app under that plan. Current published minimum is $5/month with $5 included usage; actual memory, CPU and egress can exceed it. RAM is $10/GB-month and CPU $20/vCPU-month. Thus an average 1 GB of memory alone costs about $10/month before CPU/egress; do not sell this as guaranteed $5 hosting or guaranteed cheaper than Vercel. Sources: https://docs.railway.com/pricing/plans and https://docs.railway.com/pricing/cost-control.
- **DigitalOcean:** a Basic 2 GiB/1-vCPU Droplet is listed at $12/month, excluding backup/tax/extra usage. More predictable base compute cost, but OS patching, HTTPS/reverse proxy, process restarts, scheduler, deploy rollback and monitoring are our operating responsibility. The test app peaked around 1.4 GiB on a different CPU; 2 GiB is a test candidate, not proven production capacity. Source: https://www.digitalocean.com/pricing/droplets.
- **Render:** current pricing lists a 2 GB/1-CPU instance at $25/month, before other applicable charges. Its free tier sleeps after inactivity and is unsuitable for the intended always-available workflow. It is not the leading cost-saving choice for the measured app footprint. Sources: https://render.com/pricing and https://render.com/docs/free.
- **Cloudflare Workers:** paid plan starts at $5/month plus applicable usage, but this is an adapter migration, not a standard Node deployment. The current app uses Prisma 5 with native client behavior, PDF rendering and local-storage fallbacks; compatibility needs a separate spike. The free 10 ms CPU allowance is not a sensible assumed fit for credential hashing and server-rendered application work. Sources: https://developers.cloudflare.com/workers/platform/pricing/, https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/.

## Earlier comparison recommendation (superseded)

Test Railway first if lower operational effort matters most, with an explicit approved test budget and cost alerts. Prefer a fixed-price VM if predictable base compute cost matters more and ongoing server administration is accepted. No final monthly total can be certified from local load tests.

Keep Supabase, private R2, Stripe, email and Sentry intact. The application host can change separately, so the database need not be migrated. Those services retain their own costs.

Before moving traffic: audit host-specific live-payment and private-storage guards; retain AUTH_SECRET and canonical URLs; transfer only approved environment values through secure provider APIs; use isolated staging data and test payments; verify PDFs/uploads/auth/webhooks; arrange exactly one authenticated scheduler; test health, rollback and DNS cutover. A provider spending hard limit can stop all affected workloads, so an account-wide cap must not be enabled casually on a workspace containing other products.
