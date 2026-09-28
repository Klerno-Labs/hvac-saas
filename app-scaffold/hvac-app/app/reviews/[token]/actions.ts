'use server'

import { db } from '@/lib/db'
import { z } from 'zod'

const submitReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
})

export async function submitReview(token: string, formData: FormData) {
  const parsed = submitReviewSchema.safeParse({
    rating: formData.get('rating'),
    comment: formData.get('comment') || undefined,
  })

  if (!parsed.success) {
    return { error: 'Please select a rating between 1 and 5.' }
  }

  const review = await db.customerReview.findUnique({
    where: { token },
  })

  if (!review) {
    return { error: 'Review link is invalid.' }
  }

  if (review.submittedAt) {
    return { error: 'This review has already been submitted.' }
  }

  const saved = await db.customerReview.updateMany({
    where: { id: review.id, submittedAt: null },
    data: {
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
      submittedAt: new Date(),
    },
  })

  if (saved.count !== 1) return { error: 'This review has already been submitted.' }
  return { success: true }
}
