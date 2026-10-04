# Acquisition measurement

FieldClose records a small first-party acquisition label on successful email/password signup events. The operator report counts those existing `user_signed_up` events and `organization_onboarding_completed` events by allowlisted public landing path and coarse source. It creates no new tables, tracking provider, endpoint or paid service.

## Run the read-only operator report

From `app-scaffold/hvac-app`, use the project's Node 24 runtime:

```sh
node scripts/acquisition-report.mjs --help
node --env-file=/absolute/path/to/protected-operator.env scripts/acquisition-report.mjs --all-tenants
node --env-file=/absolute/path/to/protected-operator.env scripts/acquisition-report.mjs --all-tenants --days 28 --end 2026-10-04 --format json
```

The operator environment must provide `DATABASE_URL`. Use an existing protected environment file or a read-only database credential; do not paste database credentials into shell arguments, source files or chat. No environment file is loaded automatically. Never point a public API or customer-accessible route at this report: it is an all-tenant operator tool, and the required `--all-tenants` flag makes that scope explicit. The plain Node CLI uses Node 24's native type stripping for its two pure TypeScript helpers; it needs the project source files and production Prisma client, with no `tsx` or TypeScript compiler at runtime.

The default window is the 28 days ending at execution time. `--days` accepts 1–90. `--end` is an **exclusive** UTC midnight boundary: the example above covers September 6 through October 3, 2026 in UTC. Dates filter the occurrence of each reported event, not the creation date of its signup cohort.

The database transaction is read-only, with a 20-second statement timeout and 25-second transaction timeout. At most 50,000 events are reported. Larger results fail with no partial report; narrow the window. The database query joins onboarding to the user's earliest preceding signup, which may predate the reporting window. That lookup does not change either event.

## Read the counts correctly

- **Signup events** count recorded successful email/password signups in the window. They are not site visits or an inventory of every login method.
- **Onboarding events** count recorded organization-onboarding completions in the window. Attribution comes from the earlier signup, not a fresh source assigned at onboarding.
- **Attributed** means the stored version, landing path and source passed the shared strict acquisition validator. These are browser-provided first-touch hints; they can be absent or manipulated and are not billing or security evidence.
- **Unassigned** includes legacy events, unavailable signup matches, missing metadata and invalid metadata. It is not equivalent to direct traffic.
- A `direct_or_unknown` source is a valid recorded attribution category, separate from unassigned history. Missing referrers, browser settings and privacy tools prevent a reliable distinction between direct traffic and unknown sources.

Do not divide the two totals to claim a conversion rate: onboarding in this window can belong to a signup outside it. Event counts also do not establish unique visitors, unique companies, revenue, paid subscribers or the causal effect of SEO. The report does not reconstruct attribution for historical events.

## Privacy and operating limits

Output contains only the window, measurement explanations and grouped counts with allowlisted public paths/coarse source categories. Names, emails, user IDs, organization IDs, raw event JSON, query strings and referring URLs are not output. Identifiers are used only within the database join. Small groups can still reveal business activity, so keep reports internal and apply normal access and retention controls.

The tool performs only a SELECT plus transaction safety settings. It sends no email, creates no campaigns and has no scheduler. A failure prints a generic message without provider errors or connection details.

For search discovery, use a verified Search Console property to review actual impressions, clicks, queries and indexed pages. Keep those search metrics separate from these signup/onboarding event counts. Compare matching UTC windows and evaluate which pages attract relevant prospects over time; no ranking, traffic or sales outcome is guaranteed by the report.

## Verification

`tests/acquisition-report.test.ts` covers count semantics, strict attribution/privacy handling, bounded arguments and direct plain-Node CLI execution without database access. `tests/acquisition-report.integration.test.ts` runs the real query against the integration suite's disposable PostgreSQL database. Its isolated January 2001 fixtures verify date boundaries, pre-window signup attribution, absent/future/invalid attribution, aggregate-only output and unchanged source records. It removes only the exact events it creates. Run that test only through the existing `TEST_DATABASE_URL` convention, which requires a database name ending in `_test`; never run the integration suite against live customer data.
