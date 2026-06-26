import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    organizationMember: { findFirst: vi.fn() },
    customer: { findMany: vi.fn(), create: vi.fn() },
    inventoryItem: { findMany: vi.fn(), create: vi.fn() },
    equipment: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { previewImport, commitImport } from '@/app/settings/import/actions'

const SESSION = { user: { id: 'user-1' } }
const MEMBERSHIP = { organizationId: 'org-1' }

describe('csv-import-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(SESSION as never)
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(MEMBERSHIP as never)
    vi.mocked(db.$transaction).mockImplementation(async (cb: (tx: typeof db) => Promise<void>) =>
      cb(db),
    )
    vi.mocked(trackEvent).mockResolvedValue(undefined as never)
    vi.mocked(logAudit).mockResolvedValue(undefined as never)
  })

  it('(1) preview marks an invalid email row in invalidRows', async () => {
    vi.mocked(db.customer.findMany).mockResolvedValue([] as never)

    const result = await previewImport({
      kind: 'customers',
      rows: [{ email: 'not-an-email', firstName: 'John', phone: '555-0001' }],
      mapping: { email: 'email', firstName: 'firstName', phone: 'phone' },
    })

    expect(result).toMatchObject({ success: true, total: 1, valid: 0 })
    expect((result as { invalidRows: { rowIndex: number; errors: string[] }[] }).invalidRows).toHaveLength(1)
    expect((result as { invalidRows: { rowIndex: number; errors: string[] }[] }).invalidRows[0].rowIndex).toBe(0)
    expect(
      (result as { invalidRows: { rowIndex: number; errors: string[] }[] }).invalidRows[0].errors.length,
    ).toBeGreaterThan(0)
  })

  it('(2) preview flags existing-email customer and in-file duplicate sku as duplicates', async () => {
    // Existing customer email → already_exists
    vi.mocked(db.customer.findMany).mockResolvedValueOnce([{ email: 'existing@test.com' }] as never)

    const r1 = await previewImport({
      kind: 'customers',
      rows: [{ email: 'existing@test.com', firstName: 'Jane', phone: '555-0002' }],
      mapping: { email: 'email', firstName: 'firstName', phone: 'phone' },
    })

    expect(r1).toMatchObject({
      success: true,
      duplicateRows: [{ rowIndex: 0, reason: 'already_exists' }],
    })

    // Same sku twice in file → second row is in_file_duplicate
    vi.mocked(db.inventoryItem.findMany).mockResolvedValueOnce([] as never)

    const r2 = await previewImport({
      kind: 'pricebook',
      rows: [
        { name: 'Part A', sku: 'SKU-1' },
        { name: 'Part B', sku: 'SKU-1' },
      ],
      mapping: { name: 'name', sku: 'sku' },
    })

    expect(r2).toMatchObject({
      success: true,
      duplicateRows: [{ rowIndex: 1, reason: 'in_file_duplicate' }],
    })
  })

  it('(3) commit skips duplicates and creates only new rows, every create receives session organizationId', async () => {
    vi.mocked(db.customer.findMany).mockResolvedValue([{ email: 'dup@test.com' }] as never)
    vi.mocked(db.customer.create).mockResolvedValue({ id: 'c-new' } as never)

    const result = await commitImport({
      kind: 'customers',
      rows: [
        { email: 'dup@test.com', firstName: 'Skip', phone: '555-0003' },
        { email: 'new@test.com', firstName: 'Create', phone: '555-0004' },
      ],
      mapping: { email: 'email', firstName: 'firstName', phone: 'phone' },
    })

    expect(result).toMatchObject({ success: true, created: 1, skippedDuplicates: 1, skippedInvalid: 0 })
    expect(vi.mocked(db.customer.create)).toHaveBeenCalledOnce()
    expect(vi.mocked(db.customer.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    )
  })

  it('(4) equipment row with unknown customerEmail is skipped with customer_not_found', async () => {
    // No matching customer for ghost@test.com
    vi.mocked(db.customer.findMany).mockResolvedValue([] as never)

    const result = await commitImport({
      kind: 'equipment',
      rows: [{ customerEmail: 'ghost@test.com', type: 'furnace' }],
      mapping: { customerEmail: 'customerEmail', type: 'type' },
    })

    expect(result).toMatchObject({
      success: true,
      created: 0,
      skippedInvalid: 1,
      errors: [{ rowIndex: 0, reason: 'customer_not_found' }],
    })
    expect(vi.mocked(db.equipment.create)).not.toHaveBeenCalled()
  })

  it('(5) foreign organizationId in row payload is ignored; org comes from membership only', async () => {
    vi.mocked(db.customer.findMany).mockResolvedValue([] as never)
    vi.mocked(db.customer.create).mockResolvedValue({ id: 'c-safe' } as never)

    // Row contains an organizationId field; it must NOT appear in the create call
    const result = await commitImport({
      kind: 'customers',
      rows: [{ firstName: 'Legit', phone: '555-9999', organizationId: 'evil-org' }],
      mapping: { firstName: 'firstName', phone: 'phone' },
    })

    expect(result).toMatchObject({ success: true, created: 1 })
    expect(vi.mocked(db.customer.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    )
    expect(vi.mocked(db.customer.create)).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'evil-org' }),
      }),
    )
  })
})
