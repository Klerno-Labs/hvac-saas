import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RequestActions } from './request-actions'
import {
  SERVICE_TYPE_LABELS,
  TIME_WINDOW_LABELS,
  LEAD_SOURCE_LABELS,
  type ServiceType,
  type TimeWindow,
} from '@/lib/lead-source'

const PAGE_SIZE = 30
const STATUSES = ['new', 'confirmed', 'rejected'] as const

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { organizationId } = await requireActiveSubscription()
  const params = await searchParams
  const statusFilter = params.status && (STATUSES as readonly string[]).includes(params.status)
    ? params.status
    : 'new'

  const where = { organizationId, status: statusFilter }

  const [requests, newCount] = await Promise.all([
    db.bookingRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      include: { convertedJob: { select: { id: true, title: true } } },
    }),
    db.bookingRequest.count({ where: { organizationId, status: 'new' } }),
  ])

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Booking requests</h1>
          <p className="text-sm text-muted-foreground">
            Inbound online bookings waiting to be confirmed.
          </p>
        </div>
        {newCount > 0 && (
          <Badge variant="default">{newCount} new</Badge>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/leads?status=${s}` as never}
            className="no-underline"
          >
            <Badge variant={statusFilter === s ? 'default' : 'outline'} className="cursor-pointer capitalize">
              {s}
            </Badge>
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {statusFilter === 'new'
                ? 'No new booking requests. Your online booking widget is ready when customers use it.'
                : `No ${statusFilter} requests.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">
                        {r.customerFirstName} {r.customerLastName || ''}
                      </span>
                      <Badge variant="secondary" className="text-[11px]">
                        {SERVICE_TYPE_LABELS[r.serviceType as ServiceType] ?? r.serviceType}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        via {LEAD_SOURCE_LABELS[r.leadSource as keyof typeof LEAD_SOURCE_LABELS] ?? r.leadSource}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                      <p>
                        {r.phone && <span>{r.phone}</span>}
                        {r.phone && r.email && <span> · </span>}
                        {r.email && <span>{r.email}</span>}
                      </p>
                      {(r.preferredDate || r.preferredWindow !== 'anytime') && (
                        <p>
                          Preferred: {r.preferredDate ? new Date(r.preferredDate).toLocaleDateString() : 'any day'}
                          {r.preferredWindow !== 'anytime' && ` ${TIME_WINDOW_LABELS[r.preferredWindow as TimeWindow] ?? r.preferredWindow}`}
                        </p>
                      )}
                      {r.addressLine1 && (
                        <p className="truncate">{[r.addressLine1, r.city, r.state, r.postalCode].filter(Boolean).join(', ')}</p>
                      )}
                      {r.description && (
                        <p className="text-foreground/80 italic line-clamp-2">&ldquo;{r.description}&rdquo;</p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {r.status === 'confirmed' && r.convertedJob ? (
                      <Link
                        href={`/jobs/${r.convertedJob.id}` as never}
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
                      >
                        View job →
                      </Link>
                    ) : r.status === 'rejected' ? (
                      <span className="text-xs text-muted-foreground">Dismissed</span>
                    ) : (
                      <RequestActions
                        request={{
                          id: r.id,
                          status: r.status,
                          customerFirstName: r.customerFirstName,
                          customerLastName: r.customerLastName,
                        }}
                        organizationId={organizationId}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
