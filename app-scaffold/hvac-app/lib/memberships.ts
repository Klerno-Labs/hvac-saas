import { db } from '@/lib/db'
import { EnrollMembershipInput } from '@/lib/validations/membership'

export async function listMembershipsForOrg({ organizationId }: { organizationId: string }) {
  return db.membership.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function enrollCustomer({
  organizationId,
  userId: _userId,
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
      recurringJobId: input.recurringJobId,
      status: 'active',
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
