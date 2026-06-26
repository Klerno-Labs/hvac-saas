import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isValidBookingSlug, resolveBookingOrg } from '@/lib/booking'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookingForm } from './booking-form'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  if (!isValidBookingSlug(slug)) return {}
  const org = await resolveBookingOrg(slug)
  if (!org) return {}
  return { title: `Book a service with ${org.name}` }
}

export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (!isValidBookingSlug(slug)) notFound()

  const org = await resolveBookingOrg(slug)
  if (!org) notFound()

  return (
    <main className="max-w-lg mx-auto px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Book a service with {org.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fill out the form below and {org.name} will reach out to confirm your appointment.
          </p>
        </CardHeader>
        <CardContent>
          <BookingForm slug={slug} orgName={org.name} />
        </CardContent>
      </Card>
    </main>
  )
}
