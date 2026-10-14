# Operational release gates

This report checks individual prerequisites. It does not certify a launch, combine failures into a readiness score, send a test message, trigger scheduled work, or repair a database.

Run from `app-scaffold/hvac-app` using the project Node 24 runtime:

```sh
node scripts/production-readiness.mjs --json
node --env-file=/protected/path/to/production.env scripts/production-readiness.mjs --database --json
```

The default reads local configuration and the checked-out schema/migration manifest only. Environment files are not loaded implicitly. The explicit `--database` option opens a transaction with `SET TRANSACTION READ ONLY`, a connection timeout, and a bounded query timeout. It reads schema columns, unique keys, migration names/checksums and aggregate delivery backlogs. It never calls provider APIs or imports application actions. It does not print secrets, connection strings, addresses, customer IDs, provider payloads, raw errors or stored delivery notes. Keep the report internal because configuration availability and aggregate operational counts are still internal information.

Exit 1 means a failed gate; exit 2 means critical unverified or paused gates remain; exit 0 means the reported critical gates passed. Configuration alone intentionally cannot produce a complete launch approval. A `pass` applies only to the named check. Column presence does not prove all column types, foreign keys, or a working restore procedure. Matching migrations do not replace a backup. An empty webhook backlog cannot prove provider delivery: current payment handlers rely on Stripe retries, and failed transactions may leave no local failed row. The unused webhook-store replay helpers are not a running retry service.

Use the separate provider audit (`scripts/check-provider-services.mjs`) for its supported read-only checks. Provider access and sender verification still do not establish that a real authorized message arrived, an upload can be retrieved under the intended access policy, or a payment settled. Retain the authorized release receipts for those outcomes.

## Collections recovery

Collection stages now keep versioned per-channel delivery state in the existing `CollectionAttempt.notes` field, with a summary status in `status`. No schema migration is needed. The application shows human-readable delivery summaries instead of raw state.

- A claim is committed before contacting the provider. Invoice and attempt locks serialize concurrent claims. Provider calls do not hold a database transaction open.
- Email submissions receive a stable idempotency key for that channel attempt. Only an explicit rejection or a failure before submission is eligible for a new attempt. Network errors, server errors with uncertain acceptance, malformed success responses, and interrupted claims stop for review. SMS has no provider idempotency guarantee in this integration.
- Accepted email and SMS outcomes are recorded independently, so retrying a rejected channel never repeats an accepted channel. Acceptance is not inbox or handset delivery.
- Confirmed payment stops outstanding collection stages while preserving their channel evidence. A late provider receipt can update the evidence but cannot restart the stopped stage.
- Advancing to another overdue stage requires at least 24 hours after the preceding stage's most recent submission (or creation when older records have no submission timestamp). Overlapping runs cannot immediately send several escalation stages for a long-overdue invoice.
- Known failed submissions back off between attempts and stop after five attempts. Missing contact/provider configuration stays pending without consuming submission attempts. The daily scheduler means a retry may wait for its next run even after the minimum backoff expires.
- A claim still marked in-flight after ten minutes requires provider review. A crash after provider acceptance but before the database receipt is exactly such an uncertain case. It is not automatically sent again.
- Legacy attempts, including old `created` or `failed` rows without versioned channel evidence, require review. They must not be bulk reset for automatic sending.
- Eligibility is rechecked against current invoice balance/status, customer state, workspace subscription/plan, read-only state and collection settings when each channel is claimed. Payment or cancellation after a committed claim cannot recall a request already being submitted.
- Eligible invoices are processed through bounded-memory keyset pages, without a total 500-invoice cap. Completed or review rows cannot permanently starve later invoices. Platform execution time still bounds an individual run; monitor duration and backlog as volume grows.

A `review` item requires an operator to check the provider's actual request outcome before taking further action. Dismissing a stage means the operator intentionally stops that stage; it does not certify delivery or cancel an in-flight external request. Keep unknown outcomes for investigation rather than deleting their evidence. There is deliberately no automatic replay control for ambiguous sends.

This addresses collection-stage loss and duplicate retry risk. It is not a general delivery outbox for every application message. Appointment reminders still use their documented job-level marker and retain their existing secondary-channel and crash boundaries. Billing dunning after a committed billing webhook has no durable email outbox; a failed dunning notification needs operational investigation. Subscription state remains reconciled even when that notification fails.

## Scheduled work and monitoring

Keep `SCHEDULED_TASKS_ENABLED=false` until database, storage, payment and delivery gates have been verified in the intended deployment. Enabling a project variable requires a new deployment. The readiness report never authenticates to a cron endpoint: authenticated calls execute real work and may notify customers. After enabling, verify each actual scheduled run, its returned failure counts, duration, and resulting records. HTTP 200 with nonzero errors or review counts is not a successful delivery run.

Next.js server/edge instrumentation now loads the existing Sentry configurations and forwards unhandled request errors. Its client instrumentation entry initializes browser error capture when configured. No monitoring destination was created or changed. Without a DSN, no client is initialized. Tracing, session replay and breadcrumbs are disabled. Error events retain only diagnostic metadata, exception type and code locations; request/response bodies, headers, cookies, user identity, raw messages, extra context and private route tokens are removed. These settings intentionally reduce diagnostic detail to protect customer and authentication information. Handled failures returned as normal action results are not automatically exceptions in Sentry.

A configured DSN does not prove ingestion or an alert. Before launch, explicitly verify an authorized diagnostic event, alert routing, and a named responder. No live Sentry test is performed by this report. Source-map uploads and paid monitoring services are not enabled by this change.

Assign owners and escalation paths for database/restore failures, failed Stripe deliveries and reconciliation, delivery bounces/unknown outcomes, storage access errors, and paused/failed/slow scheduled runs. Review stored backlog gates independently of `/api/health`, which remains a core connectivity check only.
