import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { exportData, EXPORT_ENTITIES, ExportEntity } from '@/lib/export'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin.authorized) {
    return NextResponse.json({ error: admin.error }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const entity = searchParams.get('entity')
  const format = searchParams.get('format') ?? 'csv'

  if (!entity || !EXPORT_ENTITIES.includes(entity as ExportEntity)) {
    return NextResponse.json({ error: 'Invalid entity' }, { status: 400 })
  }
  if (format !== 'csv' && format !== 'json') {
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
  }

  const { data, filename, contentType } = await exportData(
    admin.context.organizationId,
    entity as ExportEntity,
    format,
  )

  return new NextResponse(data, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
