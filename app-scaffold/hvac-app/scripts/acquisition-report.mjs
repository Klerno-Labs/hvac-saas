#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'
import { parseAcquisitionMetadata } from '../lib/acquisition-attribution.ts'
import {
  ACQUISITION_REPORT_LIMIT,
  aggregateAcquisitionEvents,
  formatAcquisitionReport,
  parseAcquisitionReportOptions,
} from '../lib/acquisition-report.ts'

const usage = `FieldClose operator acquisition event report (read-only)

Requires Node 24 and an explicitly configured DATABASE_URL.
No environment file is loaded automatically. This report covers all tenants.

node scripts/acquisition-report.mjs --all-tenants [--days 28] [--end YYYY-MM-DD] [--format table|json]

--all-tenants  Required acknowledgment of operator-only, cross-tenant aggregation.
--days        Integer 1–90; default 28.
--end         Exclusive 00:00 UTC boundary; default is the current instant.
--format      table (default) or aggregate-only json.
--help        Print this help without connecting to a database.

Only recorded signup/onboarding event counts are reported. There are no visitor
counts or conversion rates. Legacy/missing/invalid attribution stays unassigned.
The query fails rather than reporting partial results above 50,000 events.
`

async function main() {
  let options
  try { options = parseAcquisitionReportOptions(process.argv.slice(2)) }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; return }
  if (options.help) { process.stdout.write(usage); return }
  if (!options.allTenants) { process.stderr.write('This operator report requires --all-tenants. Use --help for scope and privacy details.\n'); process.exitCode = 2; return }
  if (!process.env.DATABASE_URL) { process.stderr.write('DATABASE_URL is required. Load a protected operator environment file; do not paste credentials into command arguments.\n'); process.exitCode = 2; return }

  // Suppress Prisma query/error logs: provider errors can contain connection details.
  let db
  try {
    db = new PrismaClient({ log: [] })
    const events = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`
      await tx.$executeRaw`SET LOCAL statement_timeout = '20s'`
      // Join only inside PostgreSQL. Identifiers and unrelated event metadata never
      // leave the database. Onboarding attribution can originate before the window.
      return tx.$queryRaw`
        WITH window_events AS MATERIALIZED (
          SELECT "id", "eventName", "userId", "createdAt", "metadataJson" -> 'acquisition' AS acquisition
          FROM "ActivityEvent"
          WHERE "eventName" IN ('user_signed_up', 'organization_onboarding_completed')
            AND "createdAt" >= ${options.start} AND "createdAt" < ${options.end}
          ORDER BY "createdAt", "id"
          LIMIT ${ACQUISITION_REPORT_LIMIT + 1}
        ), signup_sources AS MATERIALIZED (
          SELECT DISTINCT ON ("userId") "userId", "createdAt", "metadataJson" -> 'acquisition' AS acquisition
          FROM "ActivityEvent"
          WHERE "eventName" = 'user_signed_up' AND "userId" IS NOT NULL AND "createdAt" < ${options.end}
            AND "userId" IN (SELECT "userId" FROM window_events WHERE "eventName" = 'organization_onboarding_completed')
          ORDER BY "userId", "createdAt", "id"
        )
        SELECT event."eventName",
          CASE WHEN event."eventName" = 'user_signed_up' THEN event.acquisition
               WHEN signup."createdAt" <= event."createdAt" THEN signup.acquisition
               ELSE NULL END AS acquisition
        FROM window_events AS event
        LEFT JOIN signup_sources AS signup ON signup."userId" = event."userId"
      `
    }, { maxWait: 5_000, timeout: 25_000 })
    if (events.length > ACQUISITION_REPORT_LIMIT) {
      process.stderr.write('More than 50,000 matching events. Use a shorter date window; no partial report was produced.\n')
      process.exitCode = 1
      return
    }
    const report = aggregateAcquisitionEvents(events, parseAcquisitionMetadata)
    const output = options.format === 'json' ? JSON.stringify({
      scope: 'all_tenants_operator_only',
      startInclusiveUtc: options.start.toISOString(),
      endExclusiveUtc: options.end.toISOString(),
      measurement: 'activity_event_counts_not_visitors_or_conversion_rates',
      onboardingAttribution: 'earliest_preceding_signup_including_before_report_window',
      unassignedMeaning: 'legacy_missing_or_invalid_attribution',
      ...report,
    }, null, 2) : formatAcquisitionReport(report, options.start, options.end)
    process.stdout.write(`${output}\n`)
  } catch {
    process.stderr.write('The acquisition report could not complete. Check database access, schema availability or use a shorter window. No partial report was produced; connection details and raw events are not printed.\n')
    process.exitCode = 1
  } finally {
    await db?.$disconnect().catch(() => {})
  }
}

await main()
