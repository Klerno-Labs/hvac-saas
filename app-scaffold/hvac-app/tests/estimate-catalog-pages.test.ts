import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({ context: vi.fn(), capability: vi.fn(), services: vi.fn(), inventory: vi.fn(), job: vi.fn(), estimate: vi.fn(), newForm: vi.fn(), editForm: vi.fn() }))
vi.mock('@/lib/session', () => ({ requireActiveSubscription: mocks.context, requirePageCapability: mocks.capability }))
vi.mock('@/lib/db', () => ({ db: { priceBookItem: { findMany: mocks.services }, inventoryItem: { findMany: mocks.inventory }, job: { findFirst: mocks.job }, estimate: { findFirst: mocks.estimate } } }))
vi.mock('@/lib/mutation-access', () => ({ jobAccessWhere: ({ organizationId }: { organizationId: string }) => ({ organizationId }) }))
vi.mock('@/app/estimates/new/form', () => ({ EstimateForm: mocks.newForm }))
vi.mock('@/app/estimates/[estimateId]/edit-form', () => ({ EstimateEditForm: mocks.editForm }))
vi.mock('@/app/estimates/[estimateId]/status-form', () => ({ EstimateStatusForm: () => null }))
vi.mock('@/app/estimates/[estimateId]/convert-button', () => ({ ConvertEstimateButton: () => null }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not found') }, redirect: (url: string) => { throw new Error(`redirect:${url}`) } }))
import NewEstimatePage from '@/app/estimates/new/page'
import EstimateDetailPage from '@/app/estimates/[estimateId]/page'
import { getEstimateCatalog } from '@/lib/estimate-catalog'

const context = { organizationId: 'server-org', userId: 'owner', role: 'owner' }
const service = { id: 'service', name: 'Inspection', category: null, description: 'Inspect equipment', flatPriceCents: 14995 }
const inventory = { id: 'part', name: 'Part', category: 'Parts', description: null, sellPriceCents: 1501 }
const job = { id: 'job', title: 'Job', customer: { firstName: 'Customer' } }
const estimate = { id: 'estimate', estimateNumber: 'EST-1', jobId: job.id, status: 'draft', job, invoice: null, lineItems: [], subtotalCents: 0, taxCents: 0, totalCents: 0 }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.context.mockResolvedValue(context)
  mocks.capability.mockResolvedValue(context)
  mocks.services.mockResolvedValue([service])
  mocks.inventory.mockResolvedValue([inventory])
  mocks.job.mockResolvedValue(job)
  mocks.estimate.mockResolvedValue(estimate)
  mocks.newForm.mockReturnValue(null)
  mocks.editForm.mockReturnValue(null)
})

describe('estimate catalog page integration', () => {
  it('loads saved services and parts for a new estimate using server tenant context', async () => {
    renderToStaticMarkup(await NewEstimatePage({ searchParams: Promise.resolve({ jobId: 'job' }) }))
    expect(mocks.capability).toHaveBeenCalledWith('editPricing')
    expect(mocks.services).toHaveBeenCalledWith({ where: { organizationId: 'server-org', deletedAt: null }, select: { id: true, name: true, description: true, category: true, flatPriceCents: true }, orderBy: { name: 'asc' } })
    expect(mocks.inventory).toHaveBeenCalledWith({ where: { organizationId: 'server-org' }, select: { id: true, name: true, description: true, category: true, sellPriceCents: true }, orderBy: { name: 'asc' } })
    expect(mocks.newForm.mock.calls[0][0].priceBookItems).toEqual([
      { id: 'service', name: 'Inspection', category: null, description: 'Inspect equipment', source: 'service', unitPriceCents: 14995 },
      { id: 'part', name: 'Part', category: 'Parts', description: null, source: 'inventory', unitPriceCents: 1501 },
    ])
  })

  it('uses the same catalog for editing a draft', async () => {
    renderToStaticMarkup(await EstimateDetailPage({ params: Promise.resolve({ estimateId: 'estimate' }) }))
    expect(mocks.editForm.mock.calls[0][0].priceBookItems).toHaveLength(2)
    expect(mocks.editForm.mock.calls[0][0].priceBookItems[0]).toMatchObject({ source: 'service', unitPriceCents: 14995 })
  })

  it.each(['sent', 'accepted', 'declined'])('keeps %s documents immutable and does not read the catalog', async status => {
    mocks.estimate.mockResolvedValue({ ...estimate, status })
    renderToStaticMarkup(await EstimateDetailPage({ params: Promise.resolve({ estimateId: 'estimate' }) }))
    expect(mocks.services).not.toHaveBeenCalled()
    expect(mocks.inventory).not.toHaveBeenCalled()
    expect(mocks.editForm).not.toHaveBeenCalled()
  })

  it.each(['technician', 'dispatcher', 'csr', 'unknown'])('rejects %s catalog access before any read', async role => {
    await expect(getEstimateCatalog({ ...context, role })).rejects.toThrow('Pricing access required')
    expect(mocks.services).not.toHaveBeenCalled()
    expect(mocks.inventory).not.toHaveBeenCalled()
  })

  it('does not expose a catalog to a technician viewing an assigned issued estimate', async () => {
    mocks.context.mockResolvedValue({ ...context, role: 'technician' })
    mocks.estimate.mockResolvedValue({ ...estimate, status: 'sent' })
    renderToStaticMarkup(await EstimateDetailPage({ params: Promise.resolve({ estimateId: 'estimate' }) }))
    expect(mocks.services).not.toHaveBeenCalled()
    expect(mocks.inventory).not.toHaveBeenCalled()
    expect(mocks.editForm).not.toHaveBeenCalled()
  })

  it('does not load a catalog before authentication or when no job was selected', async () => {
    mocks.capability.mockRejectedValueOnce(new Error('sign in'))
    await expect(NewEstimatePage({ searchParams: Promise.resolve({ jobId: 'job' }) })).rejects.toThrow('sign in')
    await expect(NewEstimatePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/jobs')
    expect(mocks.services).not.toHaveBeenCalled()
    expect(mocks.inventory).not.toHaveBeenCalled()
  })
})
