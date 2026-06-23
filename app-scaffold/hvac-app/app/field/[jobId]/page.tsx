import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCustomerAddress, buildMapsUrl, fieldStatusVariant, fieldStatusLabel } from '@/lib/field'
import { FieldStatusControls } from './status-controls'
import { TechnicianNotesForm } from './notes-form'
import { PhotoCapture } from './photo-capture'

export default async function FieldJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { userId, organizationId } = await requireActiveSubscription()
  const { jobId } = await params

  // RBAC: only the assigned technician can open this job in the field hub.
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId, technicianUserId: userId },
    include: {
      customer: true,
      assets: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!job) notFound()

  const address = formatCustomerAddress(job.customer)
  const mapsUrl = buildMapsUrl(address)
  const beforeAssets = job.assets.filter((a) => a.kind === 'before')
  const afterAssets = job.assets.filter((a) => a.kind === 'after')
  const generalAssets = job.assets.filter((a) => a.kind === 'general')

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/field" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        &larr; Field hub
      </Link>

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-xl break-words">{job.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {job.customer.firstName} {job.customer.lastName || ''}
              {job.customer.phone ? ` · ${job.customer.phone}` : ''}
            </p>
          </div>
          <Badge variant={fieldStatusVariant(job.fieldStatus)}>
            {fieldStatusLabel(job.fieldStatus)}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {address && (
            <div>
              <p className="text-xs text-muted-foreground">Service address</p>
              <p className="text-sm">{address}</p>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline mt-2')}
                >
                  Navigate
                </a>
              )}
            </div>
          )}
          {job.scheduledFor && (
            <div>
              <p className="text-xs text-muted-foreground">Scheduled</p>
              <p className="text-sm font-medium">
                {new Date(job.scheduledFor).toLocaleString([], {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </div>
          )}
          {job.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Job notes</p>
              <p className="text-sm whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldStatusControls jobId={job.id} currentFieldStatus={job.fieldStatus} />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <TechnicianNotesForm jobId={job.id} initialNotes={job.technicianNotes ?? ''} />
        </CardContent>
      </Card>

      <PhotoCapture jobId={job.id} beforeAssets={beforeAssets} afterAssets={afterAssets} generalAssets={generalAssets} />
    </main>
  )
}
