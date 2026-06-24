'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getOrCreateReviewTokenForJob } from '@/lib/reviews'

export async function requestReview(jobId: string) {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: 'Not authenticated.' }
  }

  // Look up membership for org scoping
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!membership) {
    return { error: 'No organization membership found.' }
  }

  const organizationId = membership.organizationId

  // Verify job belongs to org
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true, customerId: true, status: true },
  })

  if (!job) {
    return { error: 'Job not found.' }
  }

  if (job.status !== 'completed') {
    return { error: 'Job must be completed before requesting a review.' }
  }

  const { url } = await getOrCreateReviewTokenForJob(jobId, organizationId, job.customerId)
  return { url }
}
