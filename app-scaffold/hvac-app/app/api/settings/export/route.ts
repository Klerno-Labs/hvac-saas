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
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin.authorized) {
    return NextResponse.json({ error: admin.error }, { status: 403, headers: PRIVATE_HEADERS })
  }
  const { organizationId, userId, userEmail } = admin.context

  const url = new URL(req.url)
  const entityParam = url.searchParams.get('entity') ?? ''
  const format = url.searchParams.get('format') ?? 'csv'
  const includeDeleted = url.searchParams.get('includeDeleted') === '1'

  if (!isExportEntity(entityParam)) {
    return NextResponse.json(
      { error: `Unknown entity. Valid: ${EXPORT_ENTITIES.join(', ')}` },
      { status: 400, headers: PRIVATE_HEADERS },
    )
  }
  const entity: ExportEntity = entityParam

  if (format !== 'csv' && format !== 'json') {
    return NextResponse.json({ error: 'format must be csv or json' }, { status: 400, headers: PRIVATE_HEADERS })
  }

  type FlatRow = Record<string, string | number | null>
  let rows: Record<string, unknown>[]
  let flatten: (row: Record<string, unknown>) => FlatRow
  const query = { take: TAKE_CEILING + 1, orderBy: { id: 'asc' as const } }

  if (entity === 'customers') {
    rows = await db.customer.findMany({
      where: { organizationId, ...(includeDeleted ? {} : { deletedAt: null }) },
      ...query,
    })
    flatten = flattenCustomer
  } else if (entity === 'jobs') {
    rows = await db.job.findMany({ where: { organizationId }, ...query })
    flatten = flattenJob
  } else if (entity === 'invoices') {
    rows = await db.invoice.findMany({ where: { organizationId }, ...query })
    flatten = flattenInvoice
  } else {
    rows = await db.payment.findMany({ where: { organizationId }, ...query })
    flatten = flattenPayment
  }

  if (rows.length > TAKE_CEILING) {
    return NextResponse.json({
      error: `This export exceeds the ${TAKE_CEILING.toLocaleString('en-US')}-record limit. No partial file was created. Contact support for a complete export.`,
      code: 'EXPORT_TOO_LARGE',
      limit: TAKE_CEILING,
    }, { status: 413, headers: PRIVATE_HEADERS })
  }
  const flat = rows.map(flatten)

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
      headers: { 'Content-Type': 'application/json', ...PRIVATE_HEADERS },
    })
  }

  const csv = toCsv(flat)
  const orgSlug = organizationId.slice(0, 8)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${orgSlug}-${entity}-${date}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
