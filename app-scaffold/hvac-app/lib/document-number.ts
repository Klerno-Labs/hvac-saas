import type { Prisma } from '@prisma/client'
/** Called inside the transaction that creates the document. Locking the org
 * serializes allocation; taking the maximum prevents reuse after deletions. */
export async function nextDocumentNumber(tx: Prisma.TransactionClient, organizationId: string, kind: 'invoice' | 'estimate'): Promise<string> {
  const locked = await tx.$queryRaw<Array<{id: string}>>`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
  if (locked.length !== 1) throw new Error('Organization not found')
  const rows = kind === 'invoice'
    ? await tx.$queryRaw<Array<{next: bigint}>>`SELECT COALESCE(MAX(SUBSTRING("invoiceNumber" FROM 5)::bigint), 0) + 1 AS next FROM "Invoice" WHERE "organizationId" = ${organizationId} AND "invoiceNumber" ~ '^INV-[0-9]{1,15}$'`
    : await tx.$queryRaw<Array<{next: bigint}>>`SELECT COALESCE(MAX(SUBSTRING("estimateNumber" FROM 5)::bigint), 0) + 1 AS next FROM "Estimate" WHERE "organizationId" = ${organizationId} AND "estimateNumber" ~ '^EST-[0-9]{1,15}$'`
  return `${kind === 'invoice' ? 'INV' : 'EST'}-${String(rows[0].next).padStart(4, '0')}`
}
