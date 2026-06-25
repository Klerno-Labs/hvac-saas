import { db } from '@/lib/db'
import type { EnrollMembershipInput } from '@/lib/validations/membership'

export async function enrollCustomer({
  organizationId,
  input,
}: {
  organizationId: string
  userId: string
  input: EnrollMembershipInput
}) {
  return db.membership.create({
    data: {
      organizationId,
      customerId: input.customerId,
      planName: input.planName,
      recurringJobId: input.recurringJobId,
    },
  })
}

export async function pauseMembership({
  organizationId,
  membershipId,
}: {
  organizationId: string
  membershipId: string
}) {
  return db.membership.updateMany({
    where: { id: membershipId, organizationId },
    data: { status: 'paused' },
  })
}

export async function cancelMembership({
  organizationId,
  membershipId,
}: {
  organizationId: string
  membershipId: string
}) {
  return db.membership.updateMany({
    where: { id: membershipId, organizationId },
    data: { status: 'cancelled' },
  })
}

export async function listMembershipsForOrg({
  organizationId,
}: {
  organizationId: string
}) {
  return db.membership.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  })
}
