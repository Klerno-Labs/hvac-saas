import type { PrismaClient } from '@prisma/client'

export type ReadinessGate = { id: string; status: 'pass' | 'fail' | 'unverified' | 'paused' | 'disabled'; critical: boolean; detail: string }
export type ExpectedDatabase = { migrations: Array<{ name: string; checksum: string }>; tables: Array<{ name: string; columns: string[]; uniqueKeys: string[][] }> }
export type DatabaseFacts = {
  connected: boolean
  columns?: Array<{ table_name: string; column_name: string }>
  uniqueKeys?: Array<{ table_name: string; columns: string[] }>
  migrations?: Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>
  queues?: { failedWebhooks: number; deadWebhooks: number; staleWebhooks: number; collectionReview: number; collectionRetry: number; collectionStale: number }
}
const nonempty = (value?: string) => Boolean(value?.trim())
function httpsOrigin(value?: string) {
  try {
    const url = new URL(value || '')
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? url.origin : null
  } catch { return null }
}

/** Reports only fixed descriptions and safe counts. Never returns config values or caught errors. */
export function configurationGates(env: Record<string, string | undefined>): ReadinessGate[] {
  const gates: ReadinessGate[] = []
  const gate = (id: string, valid: boolean, detail: string, configuredDetail: string, critical = true) => gates.push({ id, status: valid ? 'unverified' : 'fail', critical, detail: valid ? configuredDetail : detail })
  const fields = ['DATABASE_URL', 'AUTH_URL', 'APP_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET', 'STRIPE_STARTER_PRICE_ID', 'STRIPE_PRO_PRICE_ID', 'RESEND_API_KEY', 'EMAIL_FROM', 'CRON_SECRET', 'COLLECTIONS_CRON_SECRET', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN']
  const malformed = fields.filter(name => env[name] && env[name] !== env[name]!.trim())
  gates.push({ id: 'configuration.whitespace', critical: true, status: malformed.length ? 'fail' : 'pass', detail: malformed.length ? `Leading or trailing whitespace in: ${malformed.join(', ')}. Correct and redeploy.` : 'Checked configuration has no leading or trailing whitespace.' })
  let databaseValid = false
  try { const url = new URL(env.DATABASE_URL || ''); databaseValid = ['postgresql:', 'postgres:'].includes(url.protocol) && Boolean(url.hostname && url.pathname.length > 1) && !/USER|PASSWORD|HOST/.test(env.DATABASE_URL || '') } catch { /* Invalid configuration. */ }
  gate('database.configuration', databaseValid, 'A valid PostgreSQL connection URL is required.', 'Database URL is present; connectivity and migration state require --database.')
  const secret = env.AUTH_SECRET || ''
  // Whitespace is valid signing-key material. Never trim an existing key: doing
  // so rotates it and invalidates sessions. Count non-whitespace only for this check.
  gate('authentication.configuration', secret.replace(/\s/g, '').length >= 32 && !secret.includes('replace-me'), 'A non-placeholder authentication secret with at least 32 non-whitespace characters is required.',
    /\s/.test(secret) ? 'Authentication secret passes format checks and contains whitespace. Preserve the key verbatim; coordinate any intentional rotation because trimming changes the signing key and invalidates sessions. Deployed sign-in still requires verification.' : 'Authentication secret passes format checks; deployed sign-in still requires verification.')
  const appOrigin = httpsOrigin(env.APP_URL)
  const authOrigin = httpsOrigin(env.AUTH_URL)
  gate('public_origins', Boolean(appOrigin && authOrigin && appOrigin === authOrigin), 'APP_URL and AUTH_URL must be matching public HTTPS origins with no credentials, query, fragment, or path.', 'Application and authentication origins agree; deployed DNS and callback behavior are unverified.')
  const liveKey = /^(sk|rk)_live_\S+$/.test(env.STRIPE_SECRET_KEY || '')
  const platformSecret = env.STRIPE_WEBHOOK_SECRET || ''
  const connectSecret = env.STRIPE_CONNECT_WEBHOOK_SECRET || ''
  gate('customer_payments.configuration', liveKey && /^whsec_\S+$/.test(connectSecret) && connectSecret !== platformSecret, 'Live Stripe credentials and a distinct Connect signing secret are required. Test keys do not satisfy live readiness.', 'Live-format credentials and a distinct Connect signing secret exist; provider account, endpoint scope, and live settlement are unverified.')
  gate('subscription_billing.configuration', liveKey && /^whsec_\S+$/.test(platformSecret) && platformSecret !== connectSecret && /^price_\S+$/.test(env.STRIPE_STARTER_PRICE_ID || '') && /^price_\S+$/.test(env.STRIPE_PRO_PRICE_ID || ''), 'Live Stripe credentials, a separate platform signing secret, and both subscription price IDs are required.', 'Billing fields are present; verify live price amounts, currency, interval, endpoint scope, and portal configuration with the provider audit.')
  const from = env.EMAIL_FROM || ''
  gate('email.configuration', /^re_\S+$/.test(env.RESEND_API_KEY || '') && /^[^\r\n]+@[^\s<>]+\.[^\s<>]+>?$/.test(from) && !/@resend\.dev\b/i.test(from), 'Resend credentials and a business sender address are required; the sample resend.dev sender is not a production sender.', 'Email configuration is present; sender verification, authorized receipt, bounce handling and delivery alerts are unverified.')
  gate('photos.configuration', ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].every(name => nonempty(env[name])), 'All four private R2 storage settings are required.', 'Private storage settings are present; bucket access and authorized upload/read verification remain separate gates.')
  gate('scheduler.authentication', nonempty(env.CRON_SECRET), 'Vercel requires CRON_SECRET. The legacy external-scheduler token alone is not automatically sent by Vercel.', 'Vercel scheduler token is configured; this report does not invoke authenticated task routes.')
  gates.push({ id: 'scheduler.execution', critical: true, status: env.SCHEDULED_TASKS_ENABLED === 'true' ? 'unverified' : ['false', '', undefined].includes(env.SCHEDULED_TASKS_ENABLED) ? 'paused' : 'fail', detail: env.SCHEDULED_TASKS_ENABLED === 'true' ? 'Scheduled execution is explicitly enabled by configuration. Actual deployed schedules and completed runs are unverified.' : ['false', '', undefined].includes(env.SCHEDULED_TASKS_ENABLED) ? 'Scheduled work is paused. Set exactly true only in a new deployment after release and delivery verification.' : 'Scheduled work is paused because the value is ambiguous. Use exactly false to pause or true to enable; correct the configuration before release.' })
  gate('monitoring.configuration', nonempty(env.SENTRY_DSN), 'Server error monitoring has no configured destination.', 'Error monitoring has a destination; event ingestion, alert routing and an operational responder are unverified.')
  gates.push({ id: 'sms.configuration', critical: false, status: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'].every(name => nonempty(env[name])) ? 'unverified' : ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'].some(name => nonempty(env[name])) ? 'fail' : 'disabled', detail: 'SMS is optional. Configuration alone does not verify sender permissions, opt-out behavior, recipient authorization or delivery.' })
  gates.push({ id: 'webhook.recovery', critical: true, status: 'unverified', detail: 'Stripe retries failed signed deliveries; no application replay worker is wired. Review both provider endpoint failure queues and assign recovery ownership. An empty local webhook table is not proof of successful delivery.' })
  return gates
}

export function databaseGates(expected: ExpectedDatabase, facts?: DatabaseFacts): ReadinessGate[] {
  if (!facts) return [{ id: 'database.runtime', status: 'unverified', critical: true, detail: 'Database was not contacted. Use --database explicitly for read-only schema, migration and backlog checks.' }]
  if (!facts.connected) return [{ id: 'database.runtime', status: 'fail', critical: true, detail: 'Read-only database inspection failed. Check connectivity and read permissions; sensitive connection errors are omitted.' }]
  const gates: ReadinessGate[] = [{ id: 'database.runtime', status: 'pass', critical: true, detail: 'The database accepted a read-only inspection transaction.' }]
  const actualColumns = new Set(facts.columns?.map(column => `${column.table_name}.${column.column_name}`))
  const missingColumns = expected.tables.flatMap(table => table.columns.filter(column => !actualColumns.has(`${table.name}.${column}`)))
  gates.push({ id: 'database.schema_columns', critical: true, status: facts.columns && !missingColumns.length ? 'pass' : 'fail', detail: facts.columns && !missingColumns.length ? 'All columns required by the generated client exist. This is a column-presence check, not a complete backup or restore test.' : `${missingColumns.length} required columns are missing or the schema could not be inspected.` })
  const actualUnique = new Set(facts.uniqueKeys?.map(key => `${key.table_name}:${key.columns.join(',')}`))
  const missingUnique = expected.tables.flatMap(table => table.uniqueKeys.filter(key => !actualUnique.has(`${table.name}:${key.join(',')}`)))
  gates.push({ id: 'database.unique_constraints', critical: true, status: facts.uniqueKeys && !missingUnique.length ? 'pass' : 'fail', detail: facts.uniqueKeys && !missingUnique.length ? 'Required unique keys exist, including document and payment identities.' : `${missingUnique.length} required unique keys are missing or could not be inspected.` })
  const unresolved = facts.migrations?.filter(migration => !migration.finished_at && !migration.rolled_back_at).length ?? 0
  const completed = facts.migrations?.filter(migration => migration.finished_at && !migration.rolled_back_at) ?? []
  const mismatches = expected.migrations.filter(expectedMigration => !completed.some(actual => actual.migration_name === expectedMigration.name && actual.checksum === expectedMigration.checksum)).length
  const unexpected = completed.filter(actual => !expected.migrations.some(migration => migration.name === actual.migration_name)).length
  const migrationValid = Boolean(facts.migrations && expected.migrations.length && !unresolved && !mismatches && !unexpected)
  gates.push({ id: 'database.migrations', critical: true, status: migrationValid ? 'pass' : 'fail', detail: migrationValid ? 'Completed database migration names and checksums match this checkout.' : `Migration history does not match: ${mismatches} missing or changed, ${unresolved} unfinished, ${unexpected} unexpected. Do not migrate automatically from this report.` })
  if (facts.queues) {
    const q = facts.queues
    gates.push({ id: 'webhook.stored_backlog', critical: true, status: q.failedWebhooks || q.deadWebhooks || q.staleWebhooks ? 'fail' : 'pass', detail: `Stored webhook rows: ${q.failedWebhooks} failed, ${q.deadWebhooks} dead-lettered, ${q.staleWebhooks} unprocessed for over 15 minutes. Provider queues must also be checked.` })
    gates.push({ id: 'collections.stored_backlog', critical: true, status: q.collectionReview || q.collectionStale || q.collectionRetry ? 'fail' : 'pass', detail: `Open invoice delivery stages: ${q.collectionReview} need outcome review, ${q.collectionStale} have stale in-flight claims, ${q.collectionRetry} await retry or configuration. This report never retries them.` })
  } else gates.push({ id: 'delivery.stored_backlog', critical: true, status: 'unverified', detail: 'Stored delivery backlog could not be inspected with the available schema.' })
  gates.push({ id: 'database.recovery', critical: true, status: 'unverified', detail: 'A recoverable production backup and tested restore procedure require separate evidence; this script cannot verify them.' })
  return gates
}

/** No provider clients, no application actions, and no writes are called here. */
export async function inspectDatabase(client: PrismaClient): Promise<DatabaseFacts> {
  try {
    return await client.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`
      const columns = await tx.$queryRaw<NonNullable<DatabaseFacts['columns']>>`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`
      const uniqueKeys = await tx.$queryRaw<NonNullable<DatabaseFacts['uniqueKeys']>>`
        SELECT t.relname AS table_name, array_agg(a.attname::text ORDER BY k.position) AS columns
        FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
        CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, position)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE i.indisunique AND i.indisvalid AND i.indpred IS NULL AND n.nspname = current_schema()
        GROUP BY t.relname, i.indexrelid`
      const tables = new Set(columns.map(column => column.table_name))
      const migrations = tables.has('_prisma_migrations') ? await tx.$queryRaw<NonNullable<DatabaseFacts['migrations']>>`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"` : undefined
      let queues: DatabaseFacts['queues']
      const availableColumns = new Set(columns.map(column => `${column.table_name}.${column.column_name}`))
      if (['WebhookEvent.status', 'WebhookEvent.receivedAt', 'CollectionAttempt.status', 'CollectionAttempt.updatedAt', 'CollectionAttempt.invoiceId', 'Invoice.id', 'Invoice.status', 'Invoice.outstandingCents'].every(column => availableColumns.has(column))) {
        const [webhook] = await tx.$queryRaw<Array<{ failed: number; dead: number; stale: number }>>`
          SELECT COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
          COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dead,
          COUNT(*) FILTER (WHERE status = 'received' AND "receivedAt" < NOW() - INTERVAL '15 minutes')::int AS stale FROM "WebhookEvent"`
        const [collection] = await tx.$queryRaw<Array<{ review: number; retry: number; stale: number }>>`
          SELECT COUNT(*) FILTER (WHERE a.status IN ('review', 'created'))::int AS review,
          COUNT(*) FILTER (WHERE a.status IN ('retry', 'partial'))::int AS retry,
          COUNT(*) FILTER (WHERE a.status = 'sending' AND a."updatedAt" < NOW() - INTERVAL '10 minutes')::int AS stale
          FROM "CollectionAttempt" a JOIN "Invoice" i ON i.id = a."invoiceId"
          WHERE i.status IN ('sent', 'overdue') AND i."outstandingCents" > 0`
        queues = { failedWebhooks: webhook.failed, deadWebhooks: webhook.dead, staleWebhooks: webhook.stale, collectionReview: collection.review, collectionRetry: collection.retry, collectionStale: collection.stale }
      }
      return { connected: true, columns, uniqueKeys, migrations, queues }
    }, { maxWait: 5000, timeout: 15000 })
  } catch { return { connected: false } }
}
