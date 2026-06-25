import { describe, it } from 'vitest'
import { Prisma } from '@prisma/client'

describe('membership schema types', () => {
  it('MembershipPlanCreateInput compiles with required fields', () => {
    const _check: Prisma.MembershipPlanCreateInput = {
      name: 'Annual Tune-Up',
      cadence: 'annual',
      organization: { connect: { id: 'org_1' } },
    } as Prisma.MembershipPlanCreateInput
    void _check
  })

  it('MembershipCreateInput compiles with required fields', () => {
    const _check: Prisma.MembershipCreateInput = {
      startDate: new Date(),
      organization: { connect: { id: 'org_1' } },
      plan: { connect: { id: 'plan_1' } },
      customer: { connect: { id: 'cust_1' } },
    } as Prisma.MembershipCreateInput
    void _check
  })

  it('MembershipEquipmentCreateInput compiles with required fields', () => {
    const _check: Prisma.MembershipEquipmentCreateInput = {
      organizationId: 'org_1',
      membership: { connect: { id: 'mem_1' } },
      equipment: { connect: { id: 'eq_1' } },
    } as Prisma.MembershipEquipmentCreateInput
    void _check
  })
})
