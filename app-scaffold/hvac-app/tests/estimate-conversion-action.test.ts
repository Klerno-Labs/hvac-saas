import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/mutation-access', () => ({ requireMutationAccess: vi.fn() }))
vi.mock('@/lib/estimate-conversion', () => ({ convertAcceptedEstimate: vi.fn(), EstimateConversionError: class extends Error {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { requireMutationAccess } from '@/lib/mutation-access'
import { convertAcceptedEstimate, EstimateConversionError } from '@/lib/estimate-conversion'
import { createInvoiceFromEstimate } from '@/app/estimates/[estimateId]/convert-action'
import { revalidatePath } from 'next/cache'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireMutationAccess).mockResolvedValue({ authorized: true, context: { organizationId: 'org1', userId: 'user1', role: 'owner' } } as never)
  vi.mocked(convertAcceptedEstimate).mockResolvedValue({ invoiceId: 'invoice1', created: true })
})
describe('estimate conversion action', () => {
  it('requires active organization access and pricing permission', async () => {
    vi.mocked(requireMutationAccess).mockResolvedValue({ authorized: false, error: 'Your role does not have permission to make this change', status: 403 })
    expect(await createInvoiceFromEstimate('estimate1')).toEqual({ success: false, error: 'Your role does not have permission to make this change' })
    expect(requireMutationAccess).toHaveBeenCalledWith('editPricing')
    expect(convertAcceptedEstimate).not.toHaveBeenCalled()
  })
  it('derives organization and actor from the session', async () => {
    expect(await createInvoiceFromEstimate('estimate1')).toEqual({ success: true, invoiceId: 'invoice1' })
    expect(convertAcceptedEstimate).toHaveBeenCalledWith({ estimateId: 'estimate1', organizationId: 'org1', userId: 'user1' })
    expect(revalidatePath).toHaveBeenCalledWith('/estimates/estimate1')
  })
  it('returns the same invoice on a repeat conversion', async () => {
    vi.mocked(convertAcceptedEstimate).mockResolvedValue({ invoiceId: 'invoice1', created: false })
    expect(await createInvoiceFromEstimate('estimate1')).toEqual({ success: true, invoiceId: 'invoice1' })
  })
  it('returns a recoverable domain error without invalidating pages', async () => {
    vi.mocked(convertAcceptedEstimate).mockRejectedValue(new EstimateConversionError('Estimate not accepted'))
    expect(await createInvoiceFromEstimate('estimate1')).toEqual({ success: false, error: 'Estimate not accepted' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('validates the target before reaching the database', async () => {
    expect((await createInvoiceFromEstimate('')).success).toBe(false)
    expect(convertAcceptedEstimate).not.toHaveBeenCalled()
  })
})
