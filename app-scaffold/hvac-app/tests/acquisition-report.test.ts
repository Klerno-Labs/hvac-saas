import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { parseAcquisitionMetadata } from '@/lib/acquisition-attribution'
import {
  ACQUISITION_REPORT_LIMIT,
  aggregateAcquisitionEvents,
  formatAcquisitionReport,
  parseAcquisitionReportOptions,
} from '@/lib/acquisition-report'

const attribution = { version: 1, landingPath: '/resources/hvac-invoice-template', source: 'search_google' }

describe('operator acquisition aggregation', () => {
  it('keeps event types separate and missing history distinct from valid direct/unknown attribution', () => {
    const result = aggregateAcquisitionEvents([
      { eventName: 'user_signed_up', acquisition: attribution },
      { eventName: 'user_signed_up', acquisition: attribution },
      { eventName: 'organization_onboarding_completed', acquisition: attribution },
      { eventName: 'user_signed_up', acquisition: null },
      { eventName: 'organization_onboarding_completed', acquisition: undefined },
      { eventName: 'user_signed_up', acquisition: { ...attribution, source: 'direct_or_unknown' } },
      { eventName: 'invoice_paid', acquisition: attribution },
    ], parseAcquisitionMetadata)
    expect(result.signupEvents).toBe(4)
    expect(result.onboardingEvents).toBe(2)
    expect(result.groups).toEqual([
      { attribution: 'attributed', landingPath: attribution.landingPath, source: 'search_google', signupEvents: 2, onboardingEvents: 1 },
      { attribution: 'unassigned', landingPath: null, source: null, signupEvents: 1, onboardingEvents: 1 },
      { attribution: 'attributed', landingPath: attribution.landingPath, source: 'direct_or_unknown', signupEvents: 1, onboardingEvents: 0 },
    ])
  })

  it('never echoes malformed paths, bearer links, referrers, emails or extra metadata', () => {
    const privateValues = [
      { ...attribution, landingPath: '/portal/secret-token' },
      { ...attribution, landingPath: '/pricing?email=private@example.test' },
      { ...attribution, source: 'https://search.example.test/?secret=query' },
      { ...attribution, customerEmail: 'private@example.test', userId: 'user-secret', organizationId: 'org-secret' },
      { ...attribution, version: 2 },
      'raw private event JSON',
    ]
    const result = aggregateAcquisitionEvents(privateValues.map(acquisition => ({ eventName: 'user_signed_up', acquisition })), parseAcquisitionMetadata)
    expect(result.groups).toEqual([{ attribution: 'unassigned', landingPath: null, source: null, signupEvents: 6, onboardingEvents: 0 }])
    const output = JSON.stringify(result) + formatAcquisitionReport(result, new Date('2026-09-06Z'), new Date('2026-10-04Z'))
    for (const secret of ['secret-token', 'private@example.test', 'search.example.test', 'user-secret', 'org-secret', 'raw private event JSON']) expect(output).not.toContain(secret)
  })

  it('refuses a capped dataset rather than emitting a misleading partial total', () => {
    expect(() => aggregateAcquisitionEvents(Array(ACQUISITION_REPORT_LIMIT + 1).fill({ eventName: 'user_signed_up', acquisition: attribution }), parseAcquisitionMetadata)).toThrow('limit exceeded')
  })

  it('reports empty windows and explicitly avoids visitor or conversion-rate claims', () => {
    const result = aggregateAcquisitionEvents([], parseAcquisitionMetadata)
    const output = formatAcquisitionReport(result, new Date('2026-09-06Z'), new Date('2026-10-04Z'))
    expect(result).toEqual({ signupEvents: 0, onboardingEvents: 0, groups: [] })
    expect(output).toContain('No matching events')
    expect(output).toContain('not visitors, unique companies, conversion rates or paid customers')
  })
})

describe('bounded report options', () => {
  const now = new Date('2026-10-04T16:30:00.000Z')
  it('defaults to the previous 28 days with UTC half-open boundaries', () => {
    const result = parseAcquisitionReportOptions(['--all-tenants'], now)
    expect(result.start.toISOString()).toBe('2026-09-06T16:30:00.000Z')
    expect(result.end.toISOString()).toBe(now.toISOString())
    expect(result.allTenants).toBe(true)
    expect(result.format).toBe('table')
    expect(now.toISOString()).toBe('2026-10-04T16:30:00.000Z')
  })
  it('uses an exclusive UTC midnight for explicit dates', () => {
    const result = parseAcquisitionReportOptions(['--days', '28', '--end', '2026-10-04', '--format', 'json'])
    expect(result.start.toISOString()).toBe('2026-09-06T00:00:00.000Z')
    expect(result.end.toISOString()).toBe('2026-10-04T00:00:00.000Z')
    expect(result.format).toBe('json')
  })
  it.each([
    ['--days', '0'], ['--days', '91'], ['--days', '-1'], ['--days', '1.5'], ['--days', 'Infinity'],
    ['--end', '2026-02-30'], ['--end', '2026-10-04T12:00:00Z'], ['--end', 'tomorrow'],
    ['--days'], ['--format', 'raw'], ['--days', '1', '--days', '2'], ['--unknown-secret'],
  ])('rejects invalid or unbounded arguments %j', (...args) => {
    expect(() => parseAcquisitionReportOptions(args)).toThrow()
  })
})

describe('plain Node operator CLI', () => {
  it('prints help without database access or TypeScript runtime dependencies', () => {
    const result = spawnSync(process.execPath, ['scripts/acquisition-report.mjs', '--help'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, DATABASE_URL: '' },
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('--all-tenants')
    expect(result.stdout).toContain('read-only')
    expect(result.stderr).not.toContain('Error')
  })
  it('requires explicit operator scope before accessing a configured database', () => {
    const result = spawnSync(process.execPath, ['scripts/acquisition-report.mjs'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, DATABASE_URL: 'postgresql://private-user:private-password@private-host/private-db' },
    })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('requires --all-tenants')
    expect(result.stdout).toBe('')
    expect(result.stderr).not.toMatch(/private-user|private-password|private-host|private-db/)
  })
  it('suppresses provider errors and credential-like connection details on failure', () => {
    const result = spawnSync(process.execPath, ['scripts/acquisition-report.mjs', '--all-tenants'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, DATABASE_URL: 'not-a-valid-db-url-with-private-password' },
    })
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('could not complete')
    expect(result.stderr).not.toContain('private-password')
    expect(result.stderr).not.toContain('Prisma')
  })
})
