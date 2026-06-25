'use server'

import { db } from '@/lib/db'
import { validatePortalToken } from '@/lib/portal'
import { trackEvent } from '@/lib/events'
import { sendEmail } from '@/lib/email'
import { renderEmail } from '@/lib/email-template'
import { headers } from 'next/headers'

type Result = { success: true; jobId?: string; depositRequired?: boolean; depositAmountCents?: number } | { success: false; error: string }

async function getClientIp(): Promise<string | null> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || null
}

async function loadEstimate(token: string, estimateId: string) {
  const ctx = await validatePortalToken(token)
  if (!ctx) return { error: 'Invalid or expired link' as const }

  const estimate = await db.estimate.findFirst({
    where: {
      id: estimateId,
      organizationId: ctx.organizationId,
      job: { customerId: ctx.customerId },
    },
    include: { job: { include: { customer: true } }, organization: true },
  })
  if (!estimate) return { error: 'Estimate not found' as const }
  return { ctx, estimate }
}

export async function approveEstimate(
  token: string,
  estimateId: string,
  input: { signerName: string; signatureDataUrl: string },
): Promise<Result> {
  if (!input.signerName || input.signerName.trim().length < 2) {
    return { success: false, error: 'Please type your full name' }
  }
  if (!input.signatureDataUrl || !input.signatureDataUrl.startsWith('data:image/')) {
    return { success: false, error: 'Please sign in the signature pad' }
  }

  const loaded = await loadEstimate(token, estimateId)
  if ('error' in loaded) return { success: false, error: loaded.error as string }
  const { estimate } = loaded

  if (estimate.status === 'accepted') {
    return { success: true, jobId: estimate.jobId }
  }
  if (!['sent', 'draft'].includes(estimate.status)) {
    return { success: false, error: `Cannot approve an estimate with status "${estimate.status}"` }
  }

  const ip = await getClientIp()

  await db.estimate.update({
    where: { id: estimateId },
    data: {
      status: 'accepted',
      acceptedAt: new Date(),
      decisionByName: input.signerName.trim(),
      decisionByIp: ip,
      signatureDataUrl: input.signatureDataUrl,
    },
  })

  await trackEvent({
    organizationId: estimate.organizationId,
    eventName: 'estimate_approved_by_customer',
    entityType: 'estimate',
    entityId: estimateId,
    metadataJson: { signerName: input.signerName.trim(), ip },
  })

  // Notify owner via email (best-effort, don't fail the approval if email fails)
  if (estimate.organization.email) {
    const totalFormatted = '$' + (estimate.totalCents / 100).toFixed(2)
    sendEmail({
      to: estimate.organization.email,
      subject: `Estimate #${estimate.estimateNumber} approved`,
      html: renderEmail({
        title: 'Estimate Approved',
        body: `<p><strong>${input.signerName.trim()}</strong> just approved estimate <strong>#${estimate.estimateNumber}</strong> for ${totalFormatted}.</p><p>Job: ${estimate.job.title}</p>`,
        cta: { label: 'View Estimate', url: `${process.env.APP_URL || 'https://fieldclose.app'}/estimates/${estimate.id}` },
      }),
    }).catch((e) => console.error('approval notify failed', e))
  }

  return {
    success: true,
    jobId: estimate.jobId,
    depositRequired: estimate.depositRequired,
    depositAmountCents: estimate.depositAmountCents ?? undefined,
  }
}

export async function declineEstimate(
  token: string,
  estimateId: string,
  input: { signerName: string; reason?: string },
): Promise<Result> {
  if (!input.signerName || input.signerName.trim().length < 2) {
    return { success: false, error: 'Please type your full name' }
  }

  const loaded = await loadEstimate(token, estimateId)
  if ('error' in loaded) return { success: false, error: loaded.error as string }
  const { estimate } = loaded

  if (estimate.status === 'declined') return { success: true }
  if (!['sent', 'draft'].includes(estimate.status)) {
    return { success: false, error: `Cannot decline an estimate with status "${estimate.status}"` }
  }

  const ip = await getClientIp()

  await db.estimate.update({
    where: { id: estimateId },
    data: {
      status: 'declined',
      declinedAt: new Date(),
      decisionByName: input.signerName.trim(),
      decisionByIp: ip,
      declineReason: input.reason?.trim() || null,
    },
  })

  await trackEvent({
    organizationId: estimate.organizationId,
    eventName: 'estimate_declined_by_customer',
    entityType: 'estimate',
    entityId: estimateId,
    metadataJson: { signerName: input.signerName.trim(), ip, reason: input.reason },
  })

  if (estimate.organization.email) {
    sendEmail({
      to: estimate.organization.email,
      subject: `Estimate #${estimate.estimateNumber} declined`,
      html: renderEmail({
        title: 'Estimate Declined',
        body: `<p><strong>${input.signerName.trim()}</strong> declined estimate <strong>#${estimate.estimateNumber}</strong>.</p>${input.reason ? `<p>Reason: ${input.reason}</p>` : ''}`,
      }),
    }).catch(() => {})
  }

  return { success: true }
}
