import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookingActions, BookingToggle } from './booking-actions'
import { CopyReferralButton } from '@/app/settings/referrals/copy-button'
import { bookingPublicUrl, partitionBookingRequests } from './helpers'

export default async function BookingsPage() {
  const { organizationId, organization } = await requireActiveSubscription()

  const requests = await db.bookingRequest.findMany({
    where: { organizationId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  const { newRequests, handledRequests } = partitionBookingRequests(requests)

  const baseUrl = process.env.APP_URL ?? 'http://localhost:3000'
  const publicUrl = bookingPublicUrl(baseUrl, organization.bookingSlug)

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Bookings</h1>

      {/* Public booking page */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Public booking page</CardTitle>
        </CardHeader>
        <CardContent>
          {organization.bookingEnabled && publicUrl ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <code className="text-sm bg-muted px-2 py-1 rounded flex-1 break-all">{publicUrl}</code>
              <div className="flex gap-2 shrink-0">
                <CopyReferralButton link={publicUrl} />
                <BookingToggle enabled />
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                Enable a shareable link so customers can request service online.
              </p>
              <BookingToggle enabled={false} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* New requests */}
      {newRequests.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-semibold mb-3">New ({newRequests.length})</h2>
          <div className="space-y-2">
            {newRequests.map((req) => (
              <BookingCard key={req.id} request={req} showActions />
            ))}
          </div>
        </div>
      )}

      {/* Handled requests */}
      {handledRequests.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3 text-muted-foreground">
            Handled ({handledRequests.length})
          </h2>
          <div className="space-y-2">
            {handledRequests.map((req) => (
              <BookingCard key={req.id} request={req} />
            ))}
          </div>
        </div>
      )}

      {requests.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No booking requests yet. Enable your public booking page to start receiving leads.
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  )
}

type BookingRow = {
  id: string
  serviceType: string
  preferredWindow: string | null
  contactName: string
  phone: string | null
  email: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  notes: string | null
  leadSource: string | null
  status: string
  customerId: string | null
  jobId: string | null
  createdAt: Date
}

function BookingCard({ request: req, showActions }: { request: BookingRow; showActions?: boolean }) {
  const address = [req.addressLine1, req.city, req.state].filter(Boolean).join(', ')

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-sm">{req.serviceType}</span>
              <Badge variant={req.status === 'new' ? 'outline' : req.status === 'confirmed' ? 'default' : 'secondary'}>
                {req.status}
              </Badge>
              {req.leadSource && (
                <Badge variant="secondary" className="text-[10px]">{req.leadSource}</Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mb-1">
              <span>{req.contactName}</span>
              {req.phone && <span>{req.phone}</span>}
              {req.email && <span>{req.email}</span>}
              {address && <span>{address}</span>}
              {req.preferredWindow && <span>Window: {req.preferredWindow}</span>}
              <span>{new Date(req.createdAt).toLocaleDateString()}</span>
            </div>

            {req.notes && <p className="text-sm mt-1 text-muted-foreground">{req.notes}</p>}

            {req.status === 'confirmed' && (req.customerId || req.jobId) && (
              <div className="flex gap-3 mt-2 text-xs">
                {req.customerId && (
                  <Link
                    href={`/customers/${req.customerId}` as never}
                    className="text-primary hover:underline"
                  >
                    View customer →
                  </Link>
                )}
                {req.jobId && (
                  <Link
                    href={`/jobs/${req.jobId}` as never}
                    className="text-primary hover:underline"
                  >
                    View job →
                  </Link>
                )}
              </div>
            )}
          </div>

          {showActions && (
            <div className="shrink-0">
              <BookingActions requestId={req.id} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
