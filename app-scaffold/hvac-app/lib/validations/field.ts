import { z } from 'zod'

export const FIELD_STATUSES = ['pending', 'en_route', 'on_site', 'done'] as const
export type FieldStatus = (typeof FIELD_STATUSES)[number]

export const ASSET_KINDS = ['general', 'before', 'after'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

export const updateFieldStatusSchema = z.object({
  fieldStatus: z.enum(FIELD_STATUSES, { errorMap: () => ({ message: 'Invalid field status' }) }),
})

export const saveTechnicianNotesSchema = z.object({
  notes: z.string().max(5000, 'Notes must be 5000 characters or fewer').optional().or(z.literal('')),
})

export const assetKindSchema = z.enum(ASSET_KINDS)

export type UpdateFieldStatusInput = z.infer<typeof updateFieldStatusSchema>
export type SaveTechnicianNotesInput = z.infer<typeof saveTechnicianNotesSchema>
