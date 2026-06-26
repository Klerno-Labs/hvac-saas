import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyReferralButton } from '@/app/settings/referrals/copy-button'
import { BookingActions } from './booking-actions'
import { bookingPublicUrl, partitionBookingRequests } from './helpers'
import { enableBooking, disableBooking } from './actions'

export default async function BookingsPage() {
  const { organizationId, organization } = await requireActiveSubscription()

  const bookings = await db.bookingRequest.findMany({
    where: { organizationId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  const { newRequests, handledRequests } = partitionBookingRequests(bookings)

  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const publicUrl = bookingPublicUrl(appUrl, organization.bookingSlug)

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Booking requests</h1>

      {/* Public booking page */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Public booking page</CardTitle>
        </CardHeader>
        <CardContent>
          {organization.bookingEnabled && publicUrl ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  className="flex-1 px-3 py-2 border rounded-lg bg-muted text-sm font-mono"
                />
                <CopyReferralButton link={publicUrl} />
              </div>
              <form action={disableBooking}>
                <Button type="submit" variant="outline" size="sm">
                  Disable booking page
                </Button>
              </form>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Enable a public page where customers can submit service requests online.
              </p>
              <form action={enableBooking}>
                <Button type="submit" size="sm">
                  Enable booking page
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New requests */}
      {newRequests.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-semibold mb-3">New ({newRequests.length})</h2>
          <div className="space-y-2">
            {newRequests.map((booking) => (
              <BookingCard key={booking.id} booking={booking} isNew />
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
            {handledRequests.map((booking) => (
              <BookingCard key={booking.id} booking={booking} isNew={false} />
            ))}
          </div>
        </div>
      )}

      {bookings.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No booking requests yet.</p>
          </CardContent>
        </Card>
      )}
    </main>
  )
}

type BookingRow = {
  id: string
  status: string
  serviceType: string
  preferredWindow: string | null
  contactName: string
  contactPhone: string | null
  contactEmail: string | null
  address: string | null
  notes: string | null
  leadSource: string | null
  customerId: string | null
  jobId: string | null
  createdAt: Date
}

function BookingCard({ booking, isNew }: { booking: BookingRow; isNew: boolean }) {
  return (
    <Card className={isNew ? undefined : 'opacity-70'}>
      <CardContent className="py-4">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-semibold text-sm">{booking.serviceType}</span>
              <Badge variant={booking.status === 'confirmed' ? 'default' : booking.status === 'declined' ? 'destructive' : 'outline'}>
                {booking.status}
              </Badge>
              {booking.leadSource && (
                <Badge variant="secondary" className="text-xs">{booking.leadSource}</Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-1">
              <span>{booking.contactName}</span>
              {booking.contactPhone && <span>{booking.contactPhone}</span>}
              {booking.contactEmail && <span>{booking.contactEmail}</span>}
              {booking.preferredWindow && <span>Window: {booking.preferredWindow}</span>}
            </div>

            {booking.address && (
              <p className="text-xs text-muted-foreground">{booking.address}</p>
            )}

            {booking.notes && (
              <p className="text-sm mt-1">{booking.notes}</p>
            )}

            <div className="flex gap-3 mt-2 text-xs">
              {booking.customerId && (
                <Link href={`/customers/${booking.customerId}` as never} className="text-primary hover:underline">
                  View customer
                </Link>
              )}
              {booking.jobId && (
                <Link href={`/jobs/${booking.jobId}` as never} className="text-primary hover:underline">
                  View job
                </Link>
              )}
              <span className="text-muted-foreground">{new Date(booking.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {isNew && (
            <div className="shrink-0">
              <BookingActions bookingId={booking.id} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
