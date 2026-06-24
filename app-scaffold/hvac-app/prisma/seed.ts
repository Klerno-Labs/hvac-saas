import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function seedPlanLimits() {
  const planLimits = [
    {
      plan: 'FREE' as const,
      maxUsers: 1,
      maxJobsPerMonth: 10,
      maxActiveCustomers: 5,
    },
    {
      plan: 'STARTER' as const,
      maxUsers: 5,
      maxJobsPerMonth: 100,
      maxActiveCustomers: 50,
    },
    {
      plan: 'PRO' as const,
      maxUsers: 50,
      maxJobsPerMonth: 1000,
      maxActiveCustomers: 500,
    },
  ]

  for (const planLimit of planLimits) {
    await prisma.planLimit.upsert({
      where: { plan: planLimit.plan },
      update: {},
      create: planLimit,
    })
  }

  console.log('Plan limits seeded successfully')
}

async function main() {
  await seedPlanLimits()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })