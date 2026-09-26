'use server'

import { requireMutationAccess, jobAccessWhere } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { randomBytes } from 'crypto'

export async function requestReview(jobId: string) {
  const access = await requireMutationAccess('fieldWork')
  if (!access.authorized) return { error: access.error }
  const { organizationId } = access.context

  // Verify job belongs to org
  const job = await db.job.findFirst({
    where: { id: jobId, ...jobAccessWhere(access.context) },
    select: { id: true, customerId: true, status: true },
  })

  if (!job) {
    return { error: 'Job not found.' }
  }

  if (job.status !== 'completed') {
    return { error: 'Job must be completed before requesting a review.' }
  }

  // Check if review already exists
  const existing = await db.customerReview.findUnique({
    where: { jobId },
  })

  if (existing) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    return { url: `${appUrl}/reviews/${existing.token}` }
  }

  // Create review with token
  const token = randomBytes(32).toString('hex')
  await db.customerReview.create({
    data: {
      organizationId,
      jobId,
      customerId: job.customerId,
      rating: 0, // placeholder until submitted
      token,
    },
  })

  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  return { url: `${appUrl}/reviews/${token}` }
}
