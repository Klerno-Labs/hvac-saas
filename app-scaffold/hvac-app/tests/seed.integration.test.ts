import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
async function seedPlanLimits() { const seed = await import('../prisma/seed'); return seed.seedPlanLimits() }

// Destructive integration tests require a dedicated disposable database.
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) {
  throw new Error('Set TEST_DATABASE_URL to a disposable database ending in _test')
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const prisma = new PrismaClient()
const seedEventId = `evt_seed_${randomUUID()}`
afterAll(async () => { await prisma.$disconnect(); await (await import('../prisma/seed')).disconnectSeed() })

describe('Plan Limits Seed', () => {
  beforeEach(async () => {
    await prisma.planLimit.deleteMany()
    await prisma.webhookEvent.deleteMany({ where: { stripeEventId: seedEventId } })
  })

  afterEach(async () => {
    await prisma.planLimit.deleteMany()
    await prisma.webhookEvent.deleteMany({ where: { stripeEventId: seedEventId } })
  })

  it('seeds exactly one PlanLimit row per Plan enum value', async () => {
    await seedPlanLimits()

    const planLimits = await prisma.planLimit.findMany()
    expect(planLimits).toHaveLength(3)

    const plans = planLimits.map((pl) => pl.plan)
    expect(plans).toContain('FREE')
    expect(plans).toContain('STARTER')
    expect(plans).toContain('PRO')
  })

  it('ensures PRO caps >= STARTER caps >= FREE caps for every limit field', async () => {
    await seedPlanLimits()

    const planLimits = await prisma.planLimit.findMany({
      orderBy: { plan: 'asc' },
    })

    const free = planLimits.find((pl) => pl.plan === 'FREE')
    const starter = planLimits.find((pl) => pl.plan === 'STARTER')
    const pro = planLimits.find((pl) => pl.plan === 'PRO')

    expect(free).toBeDefined()
    expect(starter).toBeDefined()
    expect(pro).toBeDefined()

    expect(pro!.maxUsers).toBeGreaterThanOrEqual(starter!.maxUsers)
    expect(starter!.maxUsers).toBeGreaterThanOrEqual(free!.maxUsers)

    expect(pro!.maxJobsPerMonth).toBeGreaterThanOrEqual(starter!.maxJobsPerMonth)
    expect(starter!.maxJobsPerMonth).toBeGreaterThanOrEqual(free!.maxJobsPerMonth)

    expect(pro!.maxActiveCustomers).toBeGreaterThanOrEqual(starter!.maxActiveCustomers)
    expect(starter!.maxActiveCustomers).toBeGreaterThanOrEqual(free!.maxActiveCustomers)
  })

  it('WebhookEvent.stripeEventId unique constraint rejects duplicate inserts', async () => {
    const stripeEventId = seedEventId

    await prisma.webhookEvent.create({
      data: {
        stripeEventId,
        type: 'customer.subscription.created',
        payloadHash: 'hash_a',
      },
    })

    await expect(
      prisma.webhookEvent.create({
        data: {
          stripeEventId,
          type: 'customer.subscription.updated',
          payloadHash: 'hash_b',
        },
      })
    ).rejects.toThrow()
  })

  it('seed is idempotent - running twice does not create duplicates', async () => {
    await seedPlanLimits()
    await seedPlanLimits()

    const planLimits = await prisma.planLimit.findMany()
    expect(planLimits).toHaveLength(3)
  })
})