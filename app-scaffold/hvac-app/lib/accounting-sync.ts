import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { requirePlan } from '@/lib/billing'

type SyncResult = {
  customersProcessed: number
  invoicesProcessed: number
  paymentsProcessed: number
  errors: number
}

/**
 * Run accounting sync for a single organization.
 *
 * This creates or updates AccountingSyncRecord entries for eligible records.
 * In the MVP, records are marked as "synced" locally to track what has been
 * processed. Real provider API calls (QuickBooks, Xero) would be added
 * when provider credentials and OAuth are implemented.
 *
 * Sync order: customers -> invoices -> payments (dependency order).
 */
export async function runAccountingSync(organizationId: string, userId?: string): Promise<SyncResult> {
  const result: SyncResult = {
    customersProcessed: 0,
    invoicesProcessed: 0,
    paymentsProcessed: 0,
    errors: 0,
  }

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org || !org.accountingConnected || !org.accountingProvider) {
    return result
  }
  
  requirePlan(org, 'pro')

  await trackEvent({
    organizationId,
    userId,
    eventName: 'accounting_sync_started',
    entityType: 'organization',
    entityId: organizationId,
  })

  // 1. Sync customers
  const customers = await db.customer.findMany({
    where: { organizationId },
    select: { id: true, firstName: true, lastName: true, email: true },
  })

  for (const customer of customers) {
    try {
      await upsertSyncRecord(organizationId, 'customer', customer.id)
      result.customersProcessed++
    } catch {
      result.errors++
    }
  }

  // 2. Sync invoices (only non-draft)
  const invoices = await db.invoice.findMany({
    where: { organizationId, status: { not: 'draft' } },
    select: { id: true, invoiceNumber: true, status: true, totalCents: true },
  })

  for (const invoice of invoices) {
    try {
      await upsertSyncRecord(organizationId, 'invoice', invoice.id)
      result.invoicesProcessed++
    } catch {
      result.errors++
    }
  }

  // 3. Sync payments (only succeeded)
  const payments = await db.payment.findMany({
    where: { organizationId, status: 'succeeded' },
    select: { id: true, amountCents: true },
  })

  for (const payment of payments) {
    try {
      await upsertSyncRecord(organizationId, 'payment', payment.id)
      result.paymentsProcessed++
    } catch {
      result.errors++
    }
  }

  // Update last sync timestamp
  await db.organization.update({
    where: { id: organizationId },
    data: { accountingLastSyncAt: new Date() },
  })

  const eventName = result.errors > 0 ? 'accounting_sync_failed' : 'accounting_sync_succeeded'
  await trackEvent({
    organizationId,
    userId,
    eventName,
    entityType: 'organization',
    entityId: organizationId,
    metadataJson: { ...result },
  })

  return result
}

async function upsertSyncRecord(
  organizationId: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  const existing = await db.accountingSyncRecord.findUnique({
    where: {
      organizationId_entityType_entityId: {
        organizationId,
        entityType,
        entityId,
      },
    },
  })

  if (existing && existing.syncStatus === 'synced') {
    // Already synced — skip
    return
  }

  // In MVP, we mark as synced locally.
  // With real provider integration, this would:
  // 1. Call provider API to create/update the remote record
  // 2. Store the returned remote ID
  // 3. Handle API errors and mark as 'failed' with errorMessage
  const remoteId = `${entityType.toUpperCase()}-${entityId.slice(-8)}`

  await db.accountingSyncRecord.upsert({
    where: {
      organizationId_entityType_entityId: {
        organizationId,
        entityType,
        entityId,
      },
    },
    create: {
      organizationId,
      entityType,
      entityId,
      remoteId,
      syncStatus: 'synced',
      lastSyncAt: new Date(),
    },
    update: {
      remoteId,
      syncStatus: 'synced',
      errorMessage: null,
      lastSyncAt: new Date(),
    },
  })
}
