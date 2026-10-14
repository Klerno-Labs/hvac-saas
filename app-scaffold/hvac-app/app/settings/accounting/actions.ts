'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/require-admin'
import { updateAccountingConfigSchema } from '@/lib/validations/accounting'
import { runAccountingSync } from '@/lib/accounting-sync'

type ActionResult =
  | { success: true }
  | { success: false; error: string }

export async function updateAccountingConfig(input: {
  accountingProvider: string | null
  accountingConnected: boolean
}): Promise<ActionResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }

  const { userId, organizationId } = adminResult.context

  const parsed = updateAccountingConfigSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data
  if (data.accountingConnected) return {success: false, error: 'Accounting connections are not available yet'}

  await db.organization.update({
    where: { id: organizationId },
    data: {
      accountingProvider: data.accountingProvider,
      accountingConnected: data.accountingConnected,
    },
  })

  const eventName = data.accountingConnected
    ? 'accounting_connection_completed'
    : 'accounting_connection_started'

  await trackEvent({
    organizationId,
    userId,
    eventName,
    entityType: 'organization',
    entityId: organizationId,
    metadataJson: { provider: data.accountingProvider },
  })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: 'accounting_connection_changed',
    targetType: 'organization',
    targetId: organizationId,
    metadata: { provider: data.accountingProvider, connected: data.accountingConnected },
  })

  return { success: true }
}

type SyncResult =
  | { success: true; customersProcessed: number; invoicesProcessed: number; paymentsProcessed: number; errors: number }
  | { success: false; error: string }

export async function triggerAccountingSync(): Promise<SyncResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }

  const { userId, organizationId } = adminResult.context

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org?.accountingConnected || !org.accountingProvider) {
    return { success: false, error: 'Accounting integration is not connected' }
  }

  try {
    const result = await runAccountingSync(organizationId, userId)
    return {success: true, ...result}
  } catch {
    return {success: false, error: 'Accounting sync is not available yet. Export records for your accountant.'}
  }
}
