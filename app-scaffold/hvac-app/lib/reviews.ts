import { db } from '@/lib/db'
import { randomBytes } from 'crypto'

/**
 * Generate a secure random review token string.
 */
export function generateReviewToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Get or create a CustomerReview row (and its token) for a job and return
 * the customer-facing review URL. Reuses an existing token if present.
 *
 * Single source of truth for review-token creation — used by the manual
 * "Request Review" action and by the automated job-complete notice.
 */
export async function getOrCreateReviewTokenForJob(
  jobId: string,
  organizationId: string,
  customerId: string,
): Promise<{ token: string; url: string }> {
  const existing = await db.customerReview.findUnique({
    where: { jobId },
    select: { token: true },
  })

  const token = existing?.token ?? generateReviewToken()

  if (!existing) {
    await db.customerReview.create({
      data: {
        organizationId,
        jobId,
        customerId,
        rating: 0, // placeholder until the customer submits
        token,
      },
    })
  }

  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  return { token, url: `${appUrl}/reviews/${token}` }
}
