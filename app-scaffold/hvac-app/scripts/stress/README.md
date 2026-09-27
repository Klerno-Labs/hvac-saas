# Isolated three-year workload simulation

This is an explicit operational experiment, not part of ordinary unit/integration CI. Never target a production database or URL. The harness enforces the exact loopback database `fieldclose_three_year_20260927_test` on port 56487 and serves only `127.0.0.1:3310`. It will not seed an existing organization. Provision that disposable database and apply the repository's migrations first.

## Model

10 companies × 10 employees (owner, dispatcher, eight technicians); 250 operating weekdays/year × three years × three visits/technician/day = 180,000 historical jobs. There are 20,000 customers, 180,000 estimates, 162,000 invoices and 149,540 successful historical payments. Deterministic amounts, unpaid balances, canceled/draft work, deleted customers, line items, field notes and activity records provide independently generated financial expectations. Historical data is bulk backfill, not 180,000 browser journeys.

`history.scenario.ts` calls the real analytics implementation for every company/calendar-month and compares seven values with independent seed expectations. Calendar edge months make 37 buckets per company. It also executes the real recurring engine through 36 monthly dates: 100 plans across monthly/quarterly/biannual/annual schedules, four overlapping invocations and one duplicate rerun per date, expecting 2,190 visits.

`run-pressure.mjs` signs in all 100 accounts using actual Auth.js credentials, then calls the compiled HTTP application. It checks tenant and assigned-technician boundaries, financial role access, complete exports, actual server-action job/invoice creation, concurrent locally signed synthetic payment callbacks and late failure callbacks. Provider credentials are deliberately nonexistent; an isolated-process network guard blocks external HTTP/fetch. No email, Stripe request, SMS or Sentry delivery is performed.

The mixed workload includes lists, search, deep pagination, field views, detail pages, field writes, calendar, owner reports and analytics. Closed-loop stages use 10/25/50/100/200 outstanding requests for 20 seconds each, followed by 100 users with a 500 ms think time for 120 seconds and a lower-load recovery. Lower stages concentrate workers in the first companies; 100/200 cover all 100 accounts. A closed-loop generator measures completed throughput and can understate latency under an unbounded arrival rate. It is not a long-duration soak or a cloud capacity SLA.

## Run

Use a separate production build directory with no `.env*` files, no provider credentials, and matching source. Do not overwrite a running checkout. Default `SIM_APP_DIR` is the reviewed temporary build used for the dated experiment; set it explicitly when reproducing.

```sh
export SIM_DATABASE_URL=postgresql://hatfield@127.0.0.1:56487/fieldclose_three_year_20260927_test
export SIM_OUTPUT=/tmp/fieldclose-stress-20260927
node scripts/stress/seed-history.mjs seed
SIM_RUN=baseline SIM_APP_DIR=/path/to/isolated-built-app node scripts/stress/run-pressure.mjs
npx vitest run --config scripts/stress/vitest.config.mts
```

Run historical validation only once per seeded dataset because the recurring scenario creates retained test plans. Do not run builds, other load tests or analytics validation concurrently with timed pressure stages. `SIM_RUN` must be unique for each pressure run (payment identifiers are deliberately deterministic). Login passwords/cookies/signing keys stay in process memory; reports contain synthetic identifiers and metrics only. Runtime is bounded by phase durations, 20-second request timeouts, a 2 GiB JS heap and a 3 GiB monitored process RSS limit. The database and generated reports are retained for inspection. Stop only processes belonging to the simulation; no production cleanup is required.

The original baseline classified legitimate technician dashboard redirects as request failures. Its raw rows are retained. The analysis must separate those expected 307 responses from the actual analytics authorization defect; the corrected workload sends technicians to their field view.

Raw JSON/CSV retain every request's route label, status, timing, response bytes and tenant-marker result. Compare per-route tail latency, not only aggregate averages. Local application and database share a machine: results exclude WAN latency, serverless cold starts, production pooling, distributed rate limits, actual providers, physical readers, historical photo bytes, browser rendering and years of reliability.

## Analyze retained results

Install matplotlib in a separate Python environment, then run `python scripts/stress/analyze.py --source /path/to/results --output /path/to/report`. It preserves raw request CSVs, separates the original harness redirect misclassification from actual authorization failures, and emits HTML/Markdown, charts, phase CSV, JSON summary and SHA-256 hashes. `query-probes.mjs` captures read-only warm-cache query plans after load has stopped; those timings are not concurrent HTTP measurements.

Set `SIM_SUSTAINED_SECONDS` to an integer from 120 through 1800 for a longer bounded sustained phase (default 120). A longer run is still a local closed-loop experiment, not a hosted availability guarantee. The summary reduction avoids argument-count limits as the request sample grows.
