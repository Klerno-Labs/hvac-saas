import { z } from 'zod'

export const recordProofOfWorkSchema = z.object({
  workSummary: z.string().min(1, 'Summary of work performed is required').max(5000),
  materialsUsed: z.string().max(2000).optional().or(z.literal('')),
  completionNotes: z.string().max(2000).optional().or(z.literal('')),
  technicianId: z.string().optional().or(z.literal('')),
})

export const saveJobSignatureSchema = z.object({
  signerName: z.string().min(1, 'Signer name is required').max(100),
  signatureDataUrl: z.string().min(1, 'Signature image data is required'),
})

export type RecordProofOfWorkInput = z.infer<typeof recordProofOfWorkSchema>
export type SaveJobSignatureInput = z.infer<typeof saveJobSignatureSchema>
