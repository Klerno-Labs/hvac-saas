import { describe, it, expect, vi, beforeEach } from 'vitest'
import { previewImport, commitImport } from '@/app/settings/import/actions'

// ---------------------------------------------------------------------------
// Module mocks — no real Postgres, no real auth
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  db: {
    organizationMember: { findFirst: vi.fn() },
    customer: { findMany: vi.fn(), create: vi.fn() },
    inventoryItem: { findMany: vi.fn(), create: vi.fn() },
    equipment: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))

// ---------------------------------------------------------------------------
// Lazy imports after mocks are in place
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org_test_123'
const USER_ID = 'usr_test_456'

function setupAuth() {
  vi.mocked(auth).mockResolvedValue({ user: { id: USER_ID } } as any)
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
    organizationId: ORG_ID,
    userId: USER_ID,
  } as any)
}

/** Wire db.$transaction to execute its callback with a tx proxy that shares the same mocks. */
function setupTransaction() {
  vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
    return fn({
      customer: { create: vi.mocked(db.customer.create) },
      inventoryItem: { create: vi.mocked(db.inventoryItem.create) },
      equipment: { create: vi.mocked(db.equipment.create) },
    })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 1. preview marks an invalid email row in invalidRows
// ---------------------------------------------------------------------------

describe('previewImport — invalid email', () => {
  it('places a row with a bad email address into invalidRows', async () => {
    setupAuth()
    // customer.findMany is never called because the invalid row never reaches the dup check
    vi.mocked(db.customer.findMany).mockResolvedValue([])

    const result = await previewImport({
      kind: 'customers',
      // rows keyed by column header; mapping maps field key → header
      rows: [{ 'First Name': 'Alice', 'Phone': '555-0001', 'Email': 'not-an-email' }],
      mapping: { firstName: 'First Name', phone: 'Phone', email: 'Email' },
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.invalidRows).toHaveLength(1)
    expect(result.invalidRows[0].rowIndex).toBe(0)
    expect(result.invalidRows[0].errors.length).toBeGreaterThan(0)
    expect(result.duplicateRows).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2. preview flags org-level dup (customer email) and in-file dup (pricebook sku)
// ---------------------------------------------------------------------------

describe('previewImport — duplicate detection', () => {
  it('flags a row whose email already exists in the org as duplicate_in_org', async () => {
    setupAuth()
    vi.mocked(db.customer.findMany).mockResolvedValue([
      { email: 'existing@example.com' } as any,
    ])

    const result = await previewImport({
      kind: 'customers',
      rows: [{ Email: 'existing@example.com', 'First Name': 'Bob', Phone: '555-0002' }],
      mapping: { email: 'Email', firstName: 'First Name', phone: 'Phone' },
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.duplicateRows).toHaveLength(1)
    expect(result.duplicateRows[0].rowIndex).toBe(0)
    expect(result.duplicateRows[0].reason).toBe('duplicate_in_org')
  })

  it('flags the second row with the same sku as duplicate_in_file', async () => {
    setupAuth()
    // No existing SKUs in the org
    vi.mocked(db.inventoryItem.findMany).mockResolvedValue([])

    const result = await previewImport({
      kind: 'pricebook',
      rows: [
        { Name: 'Filter', SKU: 'F-001', Cost: '5', Price: '10', Qty: '0', Reorder: '0' },
        { Name: 'Filter Copy', SKU: 'F-001', Cost: '5', Price: '10', Qty: '0', Reorder: '0' },
      ],
      mapping: {
        name: 'Name',
        sku: 'SKU',
        unitCostCents: 'Cost',
        sellPriceCents: 'Price',
        quantityOnHand: 'Qty',
        reorderPoint: 'Reorder',
      },
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.duplicateRows).toHaveLength(1)
    expect(result.duplicateRows[0].rowIndex).toBe(1)
    expect(result.duplicateRows[0].reason).toBe('duplicate_in_file')
  })
})

// ---------------------------------------------------------------------------
// 3. commitImport skips duplicates, creates new rows, stamps organizationId
// ---------------------------------------------------------------------------

describe('commitImport — skip duplicates, create new, stamp orgId', () => {
  it('creates only the non-duplicate row and stamps organizationId from session', async () => {
    setupAuth()
    setupTransaction()

    // Simulate one existing customer by email
    vi.mocked(db.customer.findMany).mockResolvedValue([
      { email: 'existing@example.com' } as any,
    ])
    vi.mocked(db.customer.create).mockResolvedValue({ id: 'cust_new' } as any)

    const result = await commitImport({
      kind: 'customers',
      rows: [
        { Email: 'existing@example.com', 'First Name': 'Old', Phone: '555-0010' },
        { Email: 'new@example.com', 'First Name': 'New', Phone: '555-0011' },
      ],
      mapping: { email: 'Email', firstName: 'First Name', phone: 'Phone' },
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.created).toBe(1)
    expect(result.skippedDuplicates).toBe(1)

    // Verify the create call uses the session's organizationId, not anything from the payload
    expect(db.customer.create).toHaveBeenCalledOnce()
    const createArg = vi.mocked(db.customer.create).mock.calls[0][0]
    expect(createArg.data.organizationId).toBe(ORG_ID)
    expect(createArg.data.email).toBe('new@example.com')
  })
})

// ---------------------------------------------------------------------------
// 4. equipment row with unknown customerEmail is skipped with customer_not_found
// ---------------------------------------------------------------------------

describe('commitImport — equipment customer_not_found', () => {
  it('skips an equipment row when no org customer matches the email', async () => {
    setupAuth()
    setupTransaction()

    // No existing equipment serials
    vi.mocked(db.equipment.findMany).mockResolvedValue([])
    // No customers matching the email
    vi.mocked(db.customer.findMany).mockResolvedValue([])

    const result = await commitImport({
      kind: 'equipment',
      rows: [
        {
          'Customer Email': 'ghost@example.com',
          Type: 'furnace',
          Serial: 'SN-GHOST-01',
        },
      ],
      mapping: { customerEmail: 'Customer Email', type: 'Type', serial: 'Serial' },
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.created).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toBe('customer_not_found')
    expect(db.equipment.create).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 5. A foreign organizationId field in the payload is ignored
// ---------------------------------------------------------------------------

describe('previewImport — organizationId cannot be spoofed via payload', () => {
  it('uses organizationId from session membership, ignoring any extra field in payload', async () => {
    setupAuth()
    vi.mocked(db.customer.findMany).mockResolvedValue([])

    // Cast to any to simulate an attacker injecting an extra organizationId field
    const maliciousInput = {
      kind: 'customers' as const,
      rows: [{ 'First Name': 'Eve', Phone: '555-9999' }],
      mapping: { firstName: 'First Name', phone: 'Phone' },
      organizationId: 'evil_org_999',
    } as any

    await previewImport(maliciousInput)

    // db.organizationMember.findFirst must have been called to derive the real org
    expect(db.organizationMember.findFirst).toHaveBeenCalledWith({ where: { userId: USER_ID } })

    // Any findMany call must use the session org, not the spoofed one
    if (vi.mocked(db.customer.findMany).mock.calls.length > 0) {
      const whereArg = vi.mocked(db.customer.findMany).mock.calls[0][0]?.where
      expect(whereArg?.organizationId).toBe(ORG_ID)
      expect(whereArg?.organizationId).not.toBe('evil_org_999')
    }
  })
})
