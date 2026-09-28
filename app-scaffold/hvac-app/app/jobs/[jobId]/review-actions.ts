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

  // Serialize against the parent job: empty-update upserts are not atomic on every Prisma path.
  const review = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Job" WHERE id = ${jobId} AND "organizationId" = ${organizationId} FOR UPDATE`
    const existing = await tx.customerReview.findUnique({ where: { jobId } })
    if (existing) return existing
    return tx.customerReview.create({ data: { organizationId, jobId, customerId: job.customerId, rating: 0, token: randomBytes(32).toString('hex') } })
  })
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  return { url: `${appUrl}/reviews/${review.token}` }
}
