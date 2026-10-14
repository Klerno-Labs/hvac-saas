'use server'

import { requireMutationAccess, jobAccessWhere } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { saveJobSignatureSchema } from '@/lib/validations/proof-of-work'

type SaveResult =
  | { success: true }
  | { success: false; error: string }

export async function saveJobSignature(jobId: string, formData: FormData): Promise<SaveResult> {
  const access = await requireMutationAccess('fieldWork')
  if (!access.authorized) return { success: false, error: access.error }
  const { userId, organizationId } = access.context

  const job = await db.job.findFirst({
    where: { id: jobId, ...jobAccessWhere(access.context) },
  })
  if (!job) {
    return { success: false, error: 'Job not found in your organization' }
  }

  const raw = {
    signerName: formData.get('signerName'),
    signatureDataUrl: formData.get('signatureDataUrl'),
  }

  const parsed = saveJobSignatureSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  await db.jobSignature.create({
    data: {
      organizationId,
      jobId,
      signerName: data.signerName,
      signatureImageUrl: data.signatureDataUrl,
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'job_signature_saved',
    entityType: 'job',
    entityId: jobId,
    metadataJson: { signerName: data.signerName },
  })

  return { success: true }
}