import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { db } from '@/lib/db'
import {
  EXPORT_ENTITIES,
  ExportEntity,
  toCsv,
  flattenCustomer,
  flattenJob,
  flattenInvoice,
  flattenPayment,
  flattenAuditLog,
} from '@/lib/export'

export async function GET(req: NextRequest) {
  const result = await requireAdmin()
  if (!result.authorized) {
    return NextResponse.json({ error: result.error }, { status: 401 })
  }
  const { organizationId } = result.context

  const { searchParams } = req.nextUrl
  const entity = searchParams.get('entity')
  const format = searchParams.get('format') ?? 'csv'

  if (!entity || !(EXPORT_ENTITIES as readonly string[]).includes(entity)) {
    return NextResponse.json({ error: 'Invalid entity' }, { status: 400 })
  }

  let rows: Record<string, unknown>[] = []

  if (entity === 'customers') {
    const data = await db.customer.findMany({ where: { organizationId, deletedAt: null } })
    rows = data.map(flattenCustomer)
  } else if (entity === 'jobs') {
    const data = await db.job.findMany({ where: { organizationId } })
    rows = data.map(flattenJob)
  } else if (entity === 'invoices') {
    const data = await db.invoice.findMany({ where: { organizationId } })
    rows = data.map(flattenInvoice)
  } else if (entity === 'payments') {
    const data = await db.payment.findMany({ where: { organizationId } })
    rows = data.map(flattenPayment)
  } else if (entity === 'audit') {
    const data = await db.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    })
    rows = data.map(flattenAuditLog)
  }

  const filename = `${entity as ExportEntity}-export.${format}`

  if (format === 'json') {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
