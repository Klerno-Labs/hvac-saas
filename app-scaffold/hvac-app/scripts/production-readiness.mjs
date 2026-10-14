#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { configurationGates, databaseGates, inspectDatabase } from '../lib/operational-readiness.ts'

const args = new Set(process.argv.slice(2))
if (args.has('--help')) {
  console.log('Usage: node [--env-file=/protected/path] scripts/production-readiness.mjs [--database] [--json]\nDefault: configuration only; --database explicitly opens a read-only database inspection. No provider calls, messages, cron execution, uploads or mutations. Exit 1: a failed gate; 2: critical unverified/paused gate; 0: all reported critical gates passed. Provider readiness still needs the separate provider audit and authorized end-to-end evidence.')
  process.exit(0)
}
if ([...args].some(arg => !['--database', '--json'].includes(arg))) {
  console.error('Unknown option. Use --help.'); process.exit(1)
}
try {
  const migrationRoot = new URL('../prisma/migrations/', import.meta.url)
  const folders = (await readdir(migrationRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  const migrations = await Promise.all(folders.map(async name => ({ name, checksum: createHash('sha256').update(await readFile(new URL(`${name}/migration.sql`, migrationRoot))).digest('hex') })))
  const tables = Prisma.dmmf.datamodel.models.map(model => {
    const column = name => { const field = model.fields.find(field => field.name === name); return field?.dbName || name }
    return { name: model.dbName || model.name, columns: model.fields.filter(field => field.kind !== 'object').map(field => field.dbName || field.name),
      uniqueKeys: [...model.fields.filter(field => field.isId || field.isUnique).map(field => [field.dbName || field.name]), ...model.uniqueFields.map(key => key.map(column)), ...(model.primaryKey ? [model.primaryKey.fields.map(column)] : [])] }
  })
  let facts
  if (args.has('--database')) {
    let client
    try {
      const url = new URL(process.env.DATABASE_URL || '')
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid database protocol')
      url.searchParams.set('connect_timeout', '5'); url.searchParams.set('connection_limit', '1')
      client = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] })
      facts = await inspectDatabase(client)
    } catch { facts = { connected: false } }
    finally { await client?.$disconnect().catch(() => undefined) }
  }
  const gates = [...configurationGates(process.env), ...databaseGates({ migrations, tables }, facts)]
  const report = { generatedAt: new Date().toISOString(), scope: args.has('--database') ? 'Configuration and read-only database evidence; no provider verification' : 'Configuration only; no database or provider contacted', gates }
  if (args.has('--json')) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`${report.generatedAt}\n${report.scope}\n`)
    for (const gate of gates) console.log(`[${gate.status.toUpperCase()}] ${gate.id}: ${gate.detail}`)
    console.log('\nNo overall readiness claim is made. See docs/operational-readiness.md for gate evidence and recovery ownership.')
  }
  process.exitCode = gates.some(gate => gate.status === 'fail') ? 1 : gates.some(gate => gate.critical && gate.status !== 'pass') ? 2 : 0
} catch {
  console.error('Readiness report could not load its local schema or migration manifest. Run npm ci and prisma generate in the application checkout; sensitive details are omitted.')
  process.exitCode = 1
}
