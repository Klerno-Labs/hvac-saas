import { formatDateOnly } from '@/lib/format'
import { customerAccessWhere, jobAccessWhere } from '@/lib/mutation-access'
import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EQUIPMENT_TYPE_LABELS, type EquipmentType } from '@/lib/validations/equipment'

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ customerId: string; equipmentId: string }>
}) {
  const context = await requireActiveSubscription()
  const { organizationId } = context
  const { customerId, equipmentId } = await params

  const equipment = await db.equipment.findFirst({
    where: { id: equipmentId, organizationId, customerId, customer: customerAccessWhere(context) },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true } },
      serviceRecords: {
        where: { job: jobAccessWhere(context) },
        orderBy: { performedAt: 'desc' },
        take: 50,
        include: { job: { select: { id: true, title: true } } },
      },
    },
  })
  if (!equipment) notFound()

  const customerName = [equipment.customer.firstName, equipment.customer.lastName].filter(Boolean).join(' ')
  const typeLabel = EQUIPMENT_TYPE_LABELS[equipment.type as EquipmentType] || equipment.type
  const title = [equipment.make, equipment.model].filter(Boolean).join(' ') || typeLabel

  const warrantyExpiry = equipment.warrantyStartDate && equipment.partsWarrantyMonths
    ? new Date(new Date(equipment.warrantyStartDate).setMonth(
        new Date(equipment.warrantyStartDate).getMonth() + equipment.partsWarrantyMonths,
      ))
    : null
  const warrantyActive = warrantyExpiry ? warrantyExpiry > new Date() : null

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <Link href={`/customers/${customerId}` as never} className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        &larr; {customerName}
      </Link>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <CardTitle className="text-2xl">{title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{typeLabel}</p>
            </div>
            <div className="flex gap-2">
              <Badge variant={equipment.status === 'active' ? 'default' : 'secondary'}>{equipment.status}</Badge>
              {warrantyActive !== null && (
                <Badge variant={warrantyActive ? 'default' : 'destructive'}>
                  {warrantyActive ? 'Under warranty' : 'Warranty expired'}
                </Badge>
              )}
              {equipment.installedByUs && <Badge variant="outline">Installed by us</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Spec label="Serial #" value={equipment.serial} />
          <Spec label="Install date" value={equipment.installDate ? formatDateOnly(equipment.installDate) : undefined} />
          <Spec label="Tonnage" value={equipment.tonnage ? `${equipment.tonnage}` : null} />
          <Spec label="SEER" value={equipment.seer ? `${equipment.seer}` : null} />
          <Spec label="BTU" value={equipment.btu ? `${equipment.btu.toLocaleString()}` : null} />
          <Spec label="Refrigerant" value={equipment.refrigerantType} />
          <Spec label="Location" value={equipment.locationOnProperty} />
          <Spec label="Last serviced" value={equipment.lastServicedAt?.toLocaleDateString()} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Service history</CardTitle>
        </CardHeader>
        <CardContent>
          {equipment.serviceRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground">No service records yet. Records appear here when jobs are linked to this equipment.</p>
          ) : (
            <div className="space-y-2">
              {equipment.serviceRecords.map((rec) => (
                <div key={rec.id} className="flex justify-between items-start py-2 border-b last:border-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{rec.serviceType}</Badge>
                      <span className="text-sm text-muted-foreground">{new Date(rec.performedAt).toLocaleDateString()}</span>
                    </div>
                    {rec.description && <p className="text-sm mt-1">{rec.description}</p>}
                  </div>
                  {rec.job && (
                    <Link href={`/jobs/${rec.job.id}` as never} className="text-xs text-primary hover:underline">
                      View job
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {equipment.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{equipment.notes}</p>
          </CardContent>
        </Card>
      )}
    </main>
  )
}

function Spec({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  )
}
