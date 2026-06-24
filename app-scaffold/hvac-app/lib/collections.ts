import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { sendCollectionEmail } from '@/lib/email'
import { sendCollectionSms } from '@/lib/sms'
import { getOrCreatePortalUrl } from '@/lib/portal'
import { COLLECTION_STAGES, type CollectionStage } from '@/lib/validations/collections'

type RunResult = {
  organizationsProcessed: number
  attemptsCreated: number
  attemptsSkipped: number
}

/**
 * Run collections automation across all organizations with collections enabled.
 * This function is idempotent — duplicate calls for the same invoice/stage
 * are prevented by the @@unique([invoiceId, stage]) constraint.
 */
export async function runCollectionsAutomation(): Promise<RunResult> {
  const result: RunResult = {
    organizationsProcessed: 0,
    attemptsCreated: 0,
    attemptsSkipped: 0,
  }

  const organizations = await db.organization.findMany({
    where: { collectionsEnabled: true },
    select: {
      id: true,
      name: true,
      smsEnabled: true,
      collectionsOverdue1Days: true,
      collectionsOverdue2Days: true,
      collectionsFinalDays: true,
    },
  })

  for (const org of organizations) {
    result.organizationsProcessed++

    // Find eligible invoices: sent or overdue, not paid/void/draft, not paused, with a due date
    const eligibleInvoices = await db.invoice.findMany({
      where: {
        organizationId: org.id,
        status: { in: ['sent', 'overdue'] },
        collectionsPaused: false,
        dueDate: { not: null },
      },
      include: {
        collectionAttempts: true,
        customer: true,
      },
    })

    const now = new Date()

    for (const invoice of eligibleInvoices) {
      if (!invoice.dueDate) continue

      const daysPastDue = Math.floor(
        (now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      )

      // Only process if actually past due
      if (daysPastDue < 0) continue

      const existingStages = new Set(invoice.collectionAttempts.map((a) => a.stage))

      // Evaluate stages in order
      const stageThresholds: { stage: CollectionStage; days: number }[] = [
        { stage: 'overdue_1', days: org.collectionsOverdue1Days },
        { stage: 'overdue_2', days: org.collectionsOverdue2Days },
        { stage: 'final_notice', days: org.collectionsFinalDays },
      ]

      for (const { stage, days } of stageThresholds) {
        if (daysPastDue >= days && !existingStages.has(stage)) {
          try {
            await db.collectionAttempt.create({
              data: {
                organizationId: org.id,
                invoiceId: invoice.id,
                stage,
                status: 'created',
                notes: `Auto-created: ${daysPastDue} days past due`,
              },
            })

            // Send collection email to customer
            const customerEmail = invoice.customer.email
            const customerName = [invoice.customer.firstName, invoice.customer.lastName].filter(Boolean).join(' ')
            const totalFormatted = '$' + (invoice.outstandingCents / 100).toFixed(2)

            if (customerEmail) {
              const portalUrl = await getOrCreatePortalUrl(org.id, invoice.customer.id)
              await sendCollectionEmail({
                to: customerEmail,
                customerName,
                invoiceNumber: invoice.invoiceNumber,
                totalFormatted,
                orgName: org.name,
                portalUrl,
                dueDate: invoice.dueDate?.toLocaleDateString(),
                stage,
              })
            }

            // Send SMS if the customer has a phone. Send gating (smsEnabled +
            // A2P 10DLC registration) and opt-out are enforced inside
            // sendCollectionSms / sendCustomerSms so a STOP always stops
            // collections too.
            if (invoice.customer.phone) {
              await sendCollectionSms({
                organizationId: org.id,
                customerId: invoice.customer.id,
                to: invoice.customer.phone,
                customerName,
                invoiceNumber: invoice.invoiceNumber,
                totalFormatted,
                orgName: org.name,
                stage,
              })
            }

            await trackEvent({
              organizationId: org.id,
              eventName: 'collections_attempt_created',
              entityType: 'invoice',
              entityId: invoice.id,
              metadataJson: { stage, daysPastDue },
            })

            result.attemptsCreated++
          } catch (error) {
            // Unique constraint violation means attempt already exists — skip
            if (isUniqueConstraintError(error)) {
              result.attemptsSkipped++
            } else {
              console.error(`Collections error for invoice ${invoice.id} stage ${stage}:`, error)
            }
          }
        }
      }
    }
  }

  return result
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  )
}
