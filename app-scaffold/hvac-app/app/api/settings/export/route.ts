import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import {
  EXPORT_ENTITIES,
  isValidEntity,
  toCsv,
  flattenCustomer,
  flattenJob,
  flattenInvoice,
  flattenPayment,
} from '@/lib/export'

export const runtime = 'nodejs'

const TAKE_LIMIT = 50_000

export async function GET(req: NextRequest) {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return new NextResponse(adminResult.error, { status: 403 })
  }
  const { organizationId, userId, userEmail } = adminResult.context

  const url = req.nextUrl
  const entity = url.searchParams.get('entity') ?? ''
  const format = url.searchParams.get('format') ?? 'csv'
  const includeDeleted = url.searchParams.get('includeDeleted') === '1'

  if (!isValidEntity(entity)) {
    return new NextResponse(
      `Unknown entity. Valid values: ${EXPORT_ENTITIES.join(', ')}`,
      { status: 400 },
    )
  }

  if (format !== 'csv' && format !== 'json') {
    return new NextResponse('format must be csv or json', { status: 400 })
  }

  let rows: Record<string, string | number | null>[]

  if (entity === 'customers') {
    const records = await db.customer.findMany({
      where: { organizationId, ...(includeDeleted ? {} : { deletedAt: null }) },
      take: TAKE_LIMIT,
      orderBy: { createdAt: 'asc' },
    })
    rows = records.map(flattenCustomer)
  } else if (entity === 'jobs') {
    const records = await db.job.findMany({
      where: { organizationId },
      take: TAKE_LIMIT,
      orderBy: { createdAt: 'asc' },
    })
    rows = records.map(flattenJob)
  } else if (entity === 'invoices') {
    const records = await db.invoice.findMany({
      where: { organizationId },
      take: TAKE_LIMIT,
      orderBy: { createdAt: 'asc' },
    })
    rows = records.map(flattenInvoice)
  } else {
    // entity === 'payments'
    const records = await db.payment.findMany({
      where: { organizationId },
      take: TAKE_LIMIT,
      orderBy: { createdAt: 'asc' },
    })
    rows = records.map(flattenPayment)
  }

  await logAudit({
    organizationId,
    actorId: userId,
    actorEmail: userEmail,
    eventType: 'data.exported',
    targetType: entity,
    metadata: { entity, format, rowCount: rows.length },
  })

  if (format === 'json') {
    return NextResponse.json(rows)
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  })
  const orgSlug = (org?.name ?? organizationId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${orgSlug}-${entity}-${date}.csv`

  return new NextResponse(toCsv(rows), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
