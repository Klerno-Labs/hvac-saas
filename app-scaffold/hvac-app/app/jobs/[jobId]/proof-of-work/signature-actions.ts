'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { saveJobSignatureSchema } from '@/lib/validations/proof-of-work'

type SaveResult =
  | { success: true }
  | { success: false; error: string }

export async function saveJobSignature(jobId: string, formData: FormData): Promise<SaveResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const userId = session.user.id

  const membership = await db.organizationMember.findFirst({
    where: { userId },
  })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }

  const organizationId = membership.organizationId

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
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