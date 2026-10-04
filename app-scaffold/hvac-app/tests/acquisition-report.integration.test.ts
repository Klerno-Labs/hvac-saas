import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { PrismaClient, type Prisma } from '@prisma/client'

if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } }, log: [] })
const prefix = `acquisition-report-${randomUUID()}`
const start = new Date('2001-01-01T00:00:00.000Z')
const end = new Date('2001-01-29T00:00:00.000Z')
const ids: string[] = []
const attribution = (landingPath: string, source: string) => ({ version: 1, landingPath, source })

function event(label: string, eventName: string, date: string, user: string | null, acquisition?: Prisma.InputJsonValue): Prisma.ActivityEventCreateManyInput {
  const id = `${prefix}-${label}`
  ids.push(id)
  return {
    id, eventName, createdAt: new Date(date), userId: user ? `${prefix}-${user}` : null,
    metadataJson: acquisition === undefined ? { privateNote: `${prefix}-never-print` } : { acquisition, privateNote: `${prefix}-never-print` },
  }
}

beforeAll(async () => {
  // The historical window keeps this all-tenant CLI fixture separate from other
  // integration tests. Refuse collisions rather than delete any existing rows.
  const existing = await db.activityEvent.count({ where: {
    eventName: { in: ['user_signed_up', 'organization_onboarding_completed'] }, createdAt: { gte: start, lt: end },
  } })
  if (existing) throw new Error('Acquisition report fixture window is occupied; no fixture inserted')
  await db.activityEvent.createMany({ data: [
    event('old-signup', 'user_signed_up', '2000-12-30Z', 'older', attribution('/hvac-estimating-software', 'search_google')),
    event('old-onboarding', 'organization_onboarding_completed', '2001-01-02Z', 'older'),
    event('current-signup', 'user_signed_up', '2001-01-03Z', 'current', attribution('/hvac-invoicing-software', 'direct_or_unknown')),
    event('current-onboarding', 'organization_onboarding_completed', '2001-01-04Z', 'current'),
    event('missing-signup', 'organization_onboarding_completed', '2001-01-05Z', 'missing'),
    event('future-signup', 'user_signed_up', '2001-01-10Z', 'future', attribution('/resources', 'social')),
    event('before-signup', 'organization_onboarding_completed', '2001-01-06Z', 'future'),
    event('invalid-signup', 'user_signed_up', '2001-01-07Z', 'invalid', { ...attribution('/pricing', 'search_google'), email: 'private-report@example.test' }),
    event('invalid-onboarding', 'organization_onboarding_completed', '2001-01-08Z', 'invalid'),
    event('earliest-legacy-signup', 'user_signed_up', '2000-12-25Z', 'multiple'),
    event('later-signup', 'user_signed_up', '2000-12-26Z', 'multiple', attribution('/resources', 'search_bing')),
    event('multiple-onboarding', 'organization_onboarding_completed', '2001-01-09Z', 'multiple'),
    event('null-user-signup', 'user_signed_up', '2001-01-11Z', null, attribution('/pricing', 'referral_other')),
    event('null-user-onboarding', 'organization_onboarding_completed', '2001-01-12Z', null),
    event('start-boundary', 'user_signed_up', '2001-01-01Z', 'start', attribution('/resources', 'search_google')),
    event('end-boundary', 'user_signed_up', '2001-01-29Z', 'end', attribution('/resources', 'search_google')),
    event('irrelevant', 'invoice_paid', '2001-01-04Z', 'current', attribution('/resources', 'social')),
  ] })
})

afterAll(async () => {
  // No organizations or users are necessary: ActivityEvent.userId is a nullable
  // string, not a relation. Clean only this run's exact synthetic event IDs.
  if (ids.length) await db.activityEvent.deleteMany({ where: { id: { in: ids } } })
  await db.$disconnect()
})

describe('read-only acquisition CLI against PostgreSQL', () => {
  it('joins pre-window signups, rejects future/invalid sources, respects boundaries and prints no private records', async () => {
    const before = await db.activityEvent.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } })
    const result = spawnSync(process.execPath, ['scripts/acquisition-report.mjs', '--all-tenants', '--days', '28', '--end', '2001-01-29', '--format', 'json'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 35_000,
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL! },
    })
    expect(result.status).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report.startInclusiveUtc).toBe(start.toISOString())
    expect(report.endExclusiveUtc).toBe(end.toISOString())
    expect(report.signupEvents).toBe(5)
    expect(report.onboardingEvents).toBe(7)
    expect(report.groups).toEqual(expect.arrayContaining([
      { attribution: 'attributed', landingPath: '/hvac-estimating-software', source: 'search_google', signupEvents: 0, onboardingEvents: 1 },
      { attribution: 'attributed', landingPath: '/hvac-invoicing-software', source: 'direct_or_unknown', signupEvents: 1, onboardingEvents: 1 },
      { attribution: 'attributed', landingPath: '/resources', source: 'social', signupEvents: 1, onboardingEvents: 0 },
      { attribution: 'attributed', landingPath: '/resources', source: 'search_google', signupEvents: 1, onboardingEvents: 0 },
      { attribution: 'attributed', landingPath: '/pricing', source: 'referral_other', signupEvents: 1, onboardingEvents: 0 },
      { attribution: 'unassigned', landingPath: null, source: null, signupEvents: 1, onboardingEvents: 5 },
    ]))
    expect(report.groups).toHaveLength(6)
    expect(result.stdout + result.stderr).not.toContain(prefix)
    expect(result.stdout + result.stderr).not.toContain('private-report@example.test')
    expect(result.stdout).not.toMatch(/userId|organizationId|metadataJson|privateNote/)
    expect(await db.activityEvent.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } })).toEqual(before)
  }, 40_000)
})
