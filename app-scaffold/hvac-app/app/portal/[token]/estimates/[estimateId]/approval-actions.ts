'use server'

import { db } from '@/lib/db'
import { validatePortalToken } from '@/lib/portal'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { renderEmail, escapeHtml } from '@/lib/email-template'
import { approveEstimateSchema, declineEstimateSchema } from '@/lib/validations/estimate-decision'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

type Result = { success: true; jobId?: string } | { success: false; error: string }

async function getClientIp(): Promise<string | null> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0].trim().slice(0, 200) || h.get('x-real-ip')?.slice(0, 200) || null
}

async function recordDecision(token: string, estimateId: string, input: {
  status: 'accepted' | 'declined'
  signerName: string
  signatureDataUrl?: string
  signatureMethod?: 'drawn' | 'typed'
  reason?: string
}): Promise<Result> {
  const ctx = await validatePortalToken(token)
  if (!ctx) return { success: false, error: 'Invalid or expired link' }
  const estimate = await db.estimate.findFirst({
    where: { id: estimateId, organizationId: ctx.organizationId, job: { customerId: ctx.customerId }, status: { not: 'draft' } },
    include: { job: true, organization: true },
  })
  if (!estimate) return { success: false, error: 'Estimate not found' }
  if (estimate.status === input.status) return { success: true, jobId: estimate.jobId }
  if (estimate.status !== 'sent') return { success: false, error: 'A decision has already been recorded for this estimate. Refresh to see its current status.' }
  const ip = await getClientIp()
  const now = new Date()
  let changed: boolean
  try {
    changed = await db.$transaction(async tx => {
      // Follow the same lock ordering as invoice conversion so a customer
      // decision and an office action cannot overwrite each other.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${ctx.organizationId} FOR UPDATE`
      const updated = await tx.estimate.updateMany({
        where: { id: estimateId, organizationId: ctx.organizationId, job: { customerId: ctx.customerId }, status: 'sent', updatedAt: estimate.updatedAt },
        data: {
          status: input.status,
          decisionByName: input.signerName,
          decisionByIp: ip,
          ...(input.status === 'accepted'
            ? { acceptedAt: now, signatureDataUrl: input.signatureDataUrl }
            : { declinedAt: now, declineReason: input.reason || null }),
        },
      })
      if (updated.count !== 1) return false
      await trackEvent({
        organizationId: ctx.organizationId,
        eventName: input.status === 'accepted' ? 'estimate_approved_by_customer' : 'estimate_declined_by_customer',
        entityType: 'estimate', entityId: estimateId,
        metadataJson: { signerName: input.signerName, ip, ...(input.signatureMethod ? { signatureMethod: input.signatureMethod } : {}) },
      }, tx)
      await logAudit({
        organizationId: ctx.organizationId, eventType: `estimate.${input.status}_by_customer`,
        targetType: 'estimate', targetId: estimateId, ipAddress: ip ?? undefined,
        metadata: { customerId: ctx.customerId, signerName: input.signerName, ...(input.signatureMethod ? { signatureMethod: input.signatureMethod } : {}) },
      }, tx)
      return true
    })
  } catch (error) {
    console.error('Could not record estimate decision', error)
    return { success: false, error: 'Your decision could not be saved. Please try again.' }
  }
  if (!changed) return { success: false, error: 'This estimate changed while you were reviewing it. Refresh before submitting your decision.' }

  // Notification delivery cannot undo a committed, auditable customer decision.
  if (estimate.organization.email) {
    try {
      const accepted = input.status === 'accepted'
      await sendEmail({
        to: estimate.organization.email,
        subject: `Estimate #${estimate.estimateNumber} ${accepted ? 'approved' : 'declined'}`,
        html: renderEmail({
          title: accepted ? 'Estimate Approved' : 'Estimate Declined',
          body: `<p><strong>${escapeHtml(input.signerName)}</strong> ${accepted ? 'approved' : 'declined'} estimate <strong>#${escapeHtml(estimate.estimateNumber)}</strong>${accepted ? ` for $${(estimate.totalCents / 100).toFixed(2)}` : ''}.</p><p>Job: ${escapeHtml(estimate.job.title)}</p>${input.reason ? `<p>Reason: ${escapeHtml(input.reason)}</p>` : ''}`,
          cta: { label: 'View estimate', url: `${process.env.APP_URL || 'https://app.fieldclose.app'}/estimates/${estimate.id}` },
        }),
      })
    } catch (error) { console.error('Estimate decision notification failed', error) }
  }
  revalidatePath(`/portal/${token}/estimates/${estimateId}`)
  revalidatePath(`/estimates/${estimateId}`)
  return { success: true, jobId: estimate.jobId }
}

export async function approveEstimate(token: string, estimateId: string, input: { signerName: string; signatureDataUrl: string; signatureMethod?: 'drawn' | 'typed' }): Promise<Result> {
  const parsed = approveEstimateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }
  return recordDecision(token, estimateId, { status: 'accepted', ...parsed.data })
}

export async function declineEstimate(token: string, estimateId: string, input: { signerName: string; reason?: string }): Promise<Result> {
  const parsed = declineEstimateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }
  return recordDecision(token, estimateId, { status: 'declined', ...parsed.data })
}
