import { notFound } from 'next/navigation'
import { isValidBookingSlug, resolveBookingOrg } from '@/lib/booking'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookingForm } from './booking-form'

export const metadata = {
  title: 'Book a Service',
}

export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (!isValidBookingSlug(slug)) {
    notFound()
  }

  const org = await resolveBookingOrg(slug)
  if (!org) {
    notFound()
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Book a service with {org.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fill out the form below and we&apos;ll reach out to confirm your appointment.
          </p>
        </CardHeader>
        <CardContent>
          <BookingForm slug={slug} orgName={org.name} />
        </CardContent>
      </Card>
    </main>
  )
}
