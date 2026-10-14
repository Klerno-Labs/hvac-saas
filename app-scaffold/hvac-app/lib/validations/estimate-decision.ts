import { z } from 'zod'

const signerName = z.string().trim().min(2, 'Please type your full name').max(200, 'Your name is too long')
export const approveEstimateSchema = z.object({
  signerName,
  signatureMethod: z.enum(['drawn', 'typed']).default('drawn'),
  signatureDataUrl: z.string().max(250_000, 'Your signature is too large. Clear it and try again.').refine(value => {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false
    const bytes = Buffer.from(value.slice('data:image/png;base64,'.length), 'base64')
    return bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }, 'Please add a valid signature'),
})
export const declineEstimateSchema = z.object({ signerName, reason: z.string().trim().max(2000, 'Keep the reason under 2,000 characters').optional() })
