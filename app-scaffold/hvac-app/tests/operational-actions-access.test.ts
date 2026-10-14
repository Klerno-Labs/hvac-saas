import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireMutationAccess } from '@/lib/mutation-access'
import { createCustomer } from '@/app/customers/new/actions'
import { updateCustomer, deleteCustomer } from '@/app/customers/[customerId]/edit-actions'
import { createEquipment } from '@/app/customers/[customerId]/equipment/new/actions'
import { createJob } from '@/app/jobs/new/actions'
import { updateJobStatus } from '@/app/jobs/[jobId]/actions'
import { recordPartUsage } from '@/app/jobs/[jobId]/inventory-actions'
import { recordProofOfWork } from '@/app/jobs/[jobId]/proof-of-work/actions'
import { saveJobSignature } from '@/app/jobs/[jobId]/proof-of-work/signature-actions'
import { createRecurringJob } from '@/app/recurring/new/actions'
import { toggleRecurringJob } from '@/app/recurring/[recurringId]/actions'
import { createPriceBookItem } from '@/app/pricebook/actions'
import { createInventoryItem } from '@/app/inventory/new/actions'
import { updateInventoryItem } from '@/app/inventory/[itemId]/edit/actions'
import { createEstimate, generateAiDraft } from '@/app/estimates/new/actions'
import { updateEstimateStatus } from '@/app/estimates/[estimateId]/actions'
import { createInvoice } from '@/app/invoices/new/actions'
import { updateInvoiceStatus } from '@/app/invoices/[invoiceId]/actions'
import { toggleCollectionsPause, dismissCollectionAttempt } from '@/app/invoices/[invoiceId]/collections-actions'
import { createCheckoutSession } from '@/app/invoices/[invoiceId]/payment-actions'
import { createReminder } from '@/app/reminders/new/actions'
import { updateReminderStatus } from '@/app/reminders/actions'
import { addFieldNote, updateFieldJobStatus } from '@/app/field/actions'
import { previewImport, commitImport } from '@/app/settings/import/actions'

vi.mock('@/lib/mutation-access', () => ({ requireMutationAccess: vi.fn(), jobAccessWhere: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {} })) // Any accidental business-data access fails this suite.
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const emptyForm = () => new FormData()
const cases: [string, string, () => Promise<unknown>][] = [
  ['create customer', 'manageCustomers', () => createCustomer(emptyForm())],
  ['edit customer', 'manageCustomers', () => updateCustomer('foreign', emptyForm())],
  ['delete customer', 'manageCustomers', () => deleteCustomer('foreign')],
  ['add equipment', 'manageCustomers', () => createEquipment(emptyForm())],
  ['create job', 'manageJobs', () => createJob(emptyForm())],
  ['job status', 'fieldWork', () => updateJobStatus('foreign', emptyForm())],
  ['consume stock', 'fieldWork', () => recordPartUsage('foreign', emptyForm())],
  ['record work', 'fieldWork', () => recordProofOfWork('foreign', emptyForm())],
  ['save signature', 'fieldWork', () => saveJobSignature('foreign', emptyForm())],
  ['create recurring schedule', 'manageJobs', () => createRecurringJob(emptyForm())],
  ['toggle recurring schedule', 'manageJobs', () => toggleRecurringJob('foreign')],
  ['create price', 'editPricing', () => createPriceBookItem(emptyForm())],
  ['create inventory', 'manageInventory', () => createInventoryItem(emptyForm())],
  ['edit inventory', 'manageInventory', () => updateInventoryItem('foreign', emptyForm())],
  ['create estimate', 'editPricing', () => createEstimate({} as never)],
  ['AI draft', 'editPricing', () => generateAiDraft('foreign')],
  ['estimate status', 'editPricing', () => updateEstimateStatus('foreign', emptyForm())],
  ['create invoice', 'editPricing', () => createInvoice({} as never)],
  ['invoice status', 'editPricing', () => updateInvoiceStatus('foreign', emptyForm())],
  ['pause collections', 'editPricing', () => toggleCollectionsPause('foreign', true)],
  ['dismiss collection', 'editPricing', () => dismissCollectionAttempt('foreign')],
  ['create payment link', 'editPricing', () => createCheckoutSession('foreign')],
  ['create reminder', 'manageJobs', () => createReminder(emptyForm())],
  ['complete reminder', 'manageJobs', () => updateReminderStatus('foreign', 'completed')],
  ['field note', 'fieldWork', () => addFieldNote('foreign', 'Work note', 'client-1')],
  ['field status', 'fieldWork', () => updateFieldJobStatus('foreign', 'completed')],
  ['preview customer import', 'manageCustomers', () => previewImport({ kind: 'customers', rows: [], mapping: {} })],
  ['commit pricing import', 'editPricing', () => commitImport({ kind: 'pricebook', rows: [], mapping: {} })],
]
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireMutationAccess).mockResolvedValue({ authorized: false, status: 403,
    error: 'Your workspace is read-only. Ask the owner to update the subscription in Billing.' })
})
describe('action entrypoints fail closed before data access', () => {
  it.each(cases)('%s', async (_name, capability, call) => {
    expect(await call()).toEqual({ success: false,
      error: 'Your workspace is read-only. Ask the owner to update the subscription in Billing.' })
    expect(requireMutationAccess).toHaveBeenCalledWith(capability)
  })
})
