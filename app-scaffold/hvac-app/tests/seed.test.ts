import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { seedPlanLimits } from '../prisma/seed'

const prisma = new PrismaClient()

describe('Plan Limits Seed', () => {
  beforeEach(async () => {
    await prisma.planLimit.deleteMany()
  })

  afterEach(async () => {
    await prisma.planLimit.deleteMany()
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
    const stripeEventId = 'evt_test123'

    await prisma.webhookEvent.create({
      data: {
        stripeEventId,
        type: 'customer.subscription.created',
      },
    })

    await expect(
      prisma.webhookEvent.create({
        data: {
          stripeEventId,
          type: 'customer.subscription.updated',
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