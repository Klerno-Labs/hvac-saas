import { describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { configurationGates, databaseGates, inspectDatabase, type DatabaseFacts, type ExpectedDatabase } from '@/lib/operational-readiness'

const env = { DATABASE_URL: 'postgresql://user:private-password@example.test/app', AUTH_SECRET: 'a'.repeat(40), AUTH_URL: 'https://app.example.test', APP_URL: 'https://app.example.test', STRIPE_SECRET_KEY: 'sk_live_private-key', STRIPE_WEBHOOK_SECRET: 'whsec_private-platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_private-connect', STRIPE_STARTER_PRICE_ID: 'price_private-starter', STRIPE_PRO_PRICE_ID: 'price_private-pro', RESEND_API_KEY: 're_private-key', EMAIL_FROM: 'Business <mail@example.test>', CRON_SECRET: 'private-cron-key', SCHEDULED_TASKS_ENABLED: 'false', R2_ACCOUNT_ID: 'private-account', R2_ACCESS_KEY_ID: 'private-access', R2_SECRET_ACCESS_KEY: 'private-storage-secret', R2_BUCKET: 'private-bucket', SENTRY_DSN: 'https://private-key@sentry.example.test/123' }
const expected: ExpectedDatabase = { migrations: [{ name: '0001_fixture', checksum: 'checksum' }], tables: [{ name: 'Invoice', columns: ['id', 'organizationId', 'invoiceNumber'], uniqueKeys: [['id'], ['organizationId', 'invoiceNumber']] }] }
const facts: DatabaseFacts = { connected: true, columns: expected.tables[0].columns.map(column_name => ({ table_name: 'Invoice', column_name })), uniqueKeys: expected.tables[0].uniqueKeys.map(columns => ({ table_name: 'Invoice', columns })), migrations: [{ migration_name: '0001_fixture', checksum: 'checksum', finished_at: new Date(), rolled_back_at: null }], queues: { failedWebhooks: 0, deadWebhooks: 0, staleWebhooks: 0, collectionReview: 0, collectionRetry: 0, collectionStale: 0 } }
const config = (overrides = {}) => configurationGates({ ...env, ...overrides })

describe('redacted operational configuration gates', () => {
  it('never promotes configured provider fields into verified readiness', () => {
    expect(config().filter(gate => gate.id.includes('configuration') && gate.id !== 'configuration.whitespace').every(gate => gate.status !== 'pass')).toBe(true)
    expect(config().find(gate => gate.id === 'scheduler.execution')?.status).toBe('paused')
    expect(config().find(gate => gate.id === 'webhook.recovery')?.status).toBe('unverified')
  })
  it.each([
    [{ STRIPE_SECRET_KEY: 'sk_test_private-test' }, 'customer_payments.configuration'],
    [{ STRIPE_CONNECT_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET }, 'customer_payments.configuration'],
    [{ CRON_SECRET: '', COLLECTIONS_CRON_SECRET: 'legacy-only' }, 'scheduler.authentication'],
    [{ AUTH_SECRET: 'replace-me-with-openssl-rand-base64-32' }, 'authentication.configuration'],
    [{ EMAIL_FROM: 'Example <noreply@resend.dev>' }, 'email.configuration'],
    [{ APP_URL: 'https://user:private-password@example.test' }, 'public_origins'],
    [{ APP_URL: 'http://app.example.test' }, 'public_origins'],
    [{ APP_URL: 'https://app.example.test/portal/token' }, 'public_origins'],
    [{ SCHEDULED_TASKS_ENABLED: 'FALSE' }, 'scheduler.execution'],
    [{ R2_SECRET_ACCESS_KEY: '' }, 'photos.configuration'],
    [{ AUTH_URL: 'https://other.example.test' }, 'public_origins'],
    [{ DATABASE_URL: 'postgresql://USER:PASSWORD@HOST/db' }, 'database.configuration'],
  ])('rejects concrete configuration errors: %j', (overrides, id) => {
    expect(config(overrides).find(gate => gate.id === id)?.status).toBe('fail')
  })
  it('rejects trailing whitespace without printing the value', () => {
    const result = config({ STRIPE_SECRET_KEY: 'sk_live_very-private\n' })
    expect(result.find(gate => gate.id === 'configuration.whitespace')?.status).toBe('fail')
    expect(JSON.stringify(result)).not.toContain('very-private')
  })
  it('preserves a strong signing secret with a newline without reporting a false configuration failure', () => {
    const secret = 'fixture-M4t7V2k9Q5n8R3s6B1x0P4c7H2j9W5z8\n'
    const supplied = { ...env, AUTH_SECRET: secret }
    const gates = configurationGates(supplied)
    expect(gates.find(gate => gate.id === 'configuration.whitespace')?.status).toBe('pass')
    expect(gates.find(gate => gate.id === 'authentication.configuration')).toMatchObject({ status: 'unverified', detail: expect.stringContaining('Preserve the key verbatim') })
    expect(gates.find(gate => gate.id === 'authentication.configuration')?.detail).toContain('coordinate any intentional rotation')
    expect(supplied.AUTH_SECRET).toBe(secret)
    expect(JSON.stringify(gates)).not.toContain(secret.trim())
  })
  it.each([' '.repeat(64), '\n\t '.repeat(32), `${'x'.repeat(31)}${' '.repeat(64)}\n`])('does not count whitespace toward signing-secret strength', AUTH_SECRET => {
    expect(config({ AUTH_SECRET }).find(gate => gate.id === 'authentication.configuration')?.status).toBe('fail')
  })
  it('does not require a public storage URL for private photos', () => {
    expect(config({ R2_PUBLIC_BASE_URL: '' }).find(gate => gate.id === 'photos.configuration')?.status).toBe('unverified')
  })
  it('does not expose secrets, sender addresses, bucket names or provider URLs', () => {
    const output = JSON.stringify(config())
    for (const [key, value] of Object.entries(env)) if (key !== 'SCHEDULED_TASKS_ENABLED') expect(output).not.toContain(value)
  })
})

describe('runtime gates require independent database evidence', () => {
  it('does not mistake an omitted or failed inspection for readiness', () => {
    expect(databaseGates(expected)[0].status).toBe('unverified')
    expect(databaseGates(expected, { connected: false })[0].status).toBe('fail')
  })
  it('verifies columns, unique identities and migration checksums independently', () => {
    expect(databaseGates(expected, facts).filter(gate => gate.id !== 'database.recovery').every(gate => gate.status === 'pass')).toBe(true)
    expect(databaseGates(expected, { ...facts, columns: [] }).find(gate => gate.id === 'database.schema_columns')?.status).toBe('fail')
    expect(databaseGates(expected, { ...facts, uniqueKeys: [] }).find(gate => gate.id === 'database.unique_constraints')?.status).toBe('fail')
    expect(databaseGates(expected, { ...facts, migrations: [{ ...facts.migrations![0], checksum: 'changed' }] }).find(gate => gate.id === 'database.migrations')?.status).toBe('fail')
    expect(databaseGates(expected, { ...facts, migrations: [{ ...facts.migrations![0], finished_at: null }] }).find(gate => gate.id === 'database.migrations')?.status).toBe('fail')
  })
  it('flags review, retry and stale claims instead of treating row counts as delivery proof', () => {
    const gates = databaseGates(expected, { ...facts, queues: { ...facts.queues!, failedWebhooks: 1, collectionReview: 2, collectionRetry: 3 } })
    expect(gates.find(gate => gate.id === 'webhook.stored_backlog')?.status).toBe('fail')
    expect(gates.find(gate => gate.id === 'collections.stored_backlog')?.detail).toContain('2 need outcome review')
    expect(gates.find(gate => gate.id === 'collections.stored_backlog')?.status).toBe('fail')
    expect(gates.find(gate => gate.id === 'database.recovery')?.status).toBe('unverified')
  })
  it('sets the transaction read-only before querying; only fixed SELECT statements follow', async () => {
    const statements: string[] = []
    const tx = { $executeRaw: vi.fn(async (sql: TemplateStringsArray) => { statements.push(sql.join('?')); return 0 }), $queryRaw: vi.fn(async (sql: TemplateStringsArray) => { statements.push(sql.join('?')); return [] }) }
    const client = { $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx)) }
    expect(await inspectDatabase(client as never)).toMatchObject({ connected: true })
    expect(statements[0]).toBe('SET TRANSACTION READ ONLY')
    expect(statements.slice(1).every(sql => sql.trim().startsWith('SELECT'))).toBe(true)
  })
  it('discards sensitive database errors completely', async () => {
    const result = await inspectDatabase({ $transaction: vi.fn(async () => { throw new Error(env.DATABASE_URL) }) } as never)
    expect(result).toEqual({ connected: false })
    expect(JSON.stringify(databaseGates(expected, result))).not.toContain('private-password')
  })
  it('the default CLI uses configuration only even with an unreachable database URL', () => {
    const run = spawnSync(process.execPath, ['scripts/production-readiness.mjs', '--json'], { encoding: 'utf8', env: { ...process.env, ...env, DATABASE_URL: 'postgresql://private-user:private-password@unreachable.invalid:5432/private-db' }, timeout: 10000 })
    expect([1, 2]).toContain(run.status)
    const report = JSON.parse(run.stdout)
    expect(report.scope).toContain('no database or provider contacted')
    expect(report.gates.find((gate: { id: string }) => gate.id === 'database.runtime').status).toBe('unverified')
    expect(run.stdout + run.stderr).not.toContain('private-password')
  })
})
