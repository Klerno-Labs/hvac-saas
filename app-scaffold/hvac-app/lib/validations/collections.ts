import { z } from 'zod'

export const COLLECTION_STAGES = ['overdue_1', 'overdue_2', 'final_notice'] as const
export type CollectionStage = (typeof COLLECTION_STAGES)[number]

export const COLLECTION_ATTEMPT_STATUSES = ['created', 'retry', 'sending', 'partial', 'review', 'sent', 'skipped', 'dismissed'] as const
export type CollectionAttemptStatus = (typeof COLLECTION_ATTEMPT_STATUSES)[number]

export const updateCollectionsPolicySchema = z.object({
  collectionsEnabled: z.boolean(),
  collectionsOverdue1Days: z.number().int().min(1).max(90),
  collectionsOverdue2Days: z.number().int().min(2).max(120),
  collectionsFinalDays: z.number().int().min(3).max(180),
  smsEnabled: z.boolean().optional(),
}).refine(
  (data) => data.collectionsOverdue2Days > data.collectionsOverdue1Days,
  { message: 'Second reminder must be after first reminder', path: ['collectionsOverdue2Days'] },
).refine(
  (data) => data.collectionsFinalDays > data.collectionsOverdue2Days,
  { message: 'Final notice must be after second reminder', path: ['collectionsFinalDays'] },
)

export const updateAttemptStatusSchema = z.object({
  status: z.enum(COLLECTION_ATTEMPT_STATUSES, { errorMap: () => ({ message: 'Invalid attempt status' }) }),
})

export type UpdateCollectionsPolicyInput = z.infer<typeof updateCollectionsPolicySchema>
