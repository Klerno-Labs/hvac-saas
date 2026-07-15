import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import {
  EXPORT_ENTITIES,
  ExportEntity,
  isExportEntity,
  toCsv,
  flattenCustomer,
  flattenJob,
  flattenInvoice,
  flattenPayment,
} from '@/lib/export'

export const runtime = 'nodejs'

const TAKE_CEILING = 50_000

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin.authorized) {
    return NextResponse.json({ error: admin.error }, { status: 403 })
  }
  const { organizationId, userId, userEmail } = admin.context

  const url = new URL(req.url)
  const entityParam = url.searchParams.get('entity') ?? ''
  const format = url.searchParams.get('format') ?? 'csv'
  const includeDeleted = url.searchParams.get('includeDeleted') === '1'

  if (!isExportEntity(entityParam)) {
    return NextResponse.json(
      { error: `Unknown entity. Valid: ${EXPORT_ENTITIES.join(', ')}` },
      { status: 400 },
    )
  }
  const entity: ExportEntity = entityParam

  if (format !== 'csv' && format !== 'json') {
    return NextResponse.json({ error: 'format must be csv or json' }, { status: 400 })
  }

  type FlatRow = Record<string, string | number | null>
  let flat: FlatRow[]

  if (entity === 'customers') {
    const rows = await db.customer.findMany({
      where: { organizationId, ...(includeDeleted ? {} : { deletedAt: null }) },
      take: TAKE_CEILING,
    })
    flat = rows.map((r) => flattenCustomer(r as unknown as Record<string, unknown>))
  } else if (entity === 'jobs') {
    const rows = await db.job.findMany({ where: { organizationId }, take: TAKE_CEILING })
    flat = rows.map((r) => flattenJob(r as unknown as Record<string, unknown>))
  } else if (entity === 'invoices') {
    const rows = await db.invoice.findMany({ where: { organizationId }, take: TAKE_CEILING })
    flat = rows.map((r) => flattenInvoice(r as unknown as Record<string, unknown>))
  } else {
    const rows = await db.payment.findMany({ where: { organizationId }, take: TAKE_CEILING })
    flat = rows.map((r) => flattenPayment(r as unknown as Record<string, unknown>))
  }

  await logAudit({
    organizationId,
    actorId: userId,
    actorEmail: userEmail ?? undefined,
    eventType: 'data.exported',
    targetType: entity,
    metadata: { entity, format, rowCount: flat.length },
  })

  if (format === 'json') {
    return new NextResponse(JSON.stringify(flat), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const csv = toCsv(flat)
  const orgSlug = organizationId.slice(0, 8)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${orgSlug}-${entity}-${date}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
