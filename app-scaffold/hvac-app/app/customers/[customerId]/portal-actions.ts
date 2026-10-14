'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/require-admin'
import { generateTokenString, defaultTokenExpiry } from '@/lib/portal'

type GenerateResult =
  | { success: true; portalUrl: string }
  | { success: false; error: string }

export async function generatePortalLink(customerId: string): Promise<GenerateResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }

  const { userId, organizationId } = adminResult.context

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null },
  })
  if (!customer) {
    return { success: false, error: 'Customer not found in your organization' }
  }

  const token = generateTokenString()

  await db.portalToken.create({
    data: {
      token,
      organizationId,
      customerId,
      expiresAt: defaultTokenExpiry(),
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'customer_portal_token_created',
    entityType: 'customer',
    entityId: customerId,
  })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: 'portal_token_created',
    targetType: 'customer',
    targetId: customerId,
  })

  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  return { success: true, portalUrl: `${appUrl}/portal/${token}` }
}

export async function revokePortalTokens(customerId: string): Promise<{ success: boolean; error?: string }> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }

  const { userId, organizationId } = adminResult.context

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId },
  })
  if (!customer) {
    return { success: false, error: 'Customer not found in your organization' }
  }

  await db.portalToken.updateMany({
    where: { customerId, organizationId, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'customer_portal_token_revoked',
    entityType: 'customer',
    entityId: customerId,
  })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: 'portal_token_revoked',
    targetType: 'customer',
    targetId: customerId,
  })

  return { success: true }
}
