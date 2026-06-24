import { notFound } from 'next/navigation'
import { getBookableOrganization } from '@/lib/booking'
import { BookingForm } from './form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const org = await getBookableOrganization(slug)
  if (!org) return { title: 'Online booking' }
  return {
    title: `Book online · ${org.name}`,
    description: `Request a service appointment with ${org.name}.`,
    robots: { index: true, follow: true },
  }
}

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const org = await getBookableOrganization(slug)
  if (!org) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
          <p className="text-sm text-muted-foreground">Book a service appointment online</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Request an appointment</CardTitle>
            <CardDescription>
              Tell us what you need and when works for you. We&apos;ll confirm by phone or email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BookingForm slug={slug} organization={{ name: org.name, phone: org.phone, email: org.email }} />
          </CardContent>
        </Card>

        {(org.phone || org.email) && (
          <p className="text-center text-xs text-muted-foreground mt-6">
            Prefer to talk?{' '}
            {org.phone && <>Call <a href={`tel:${org.phone}`} className="underline">{org.phone}</a></>}
            {org.phone && org.email && ' or '}
            {org.email && <>email <a href={`mailto:${org.email}`} className="underline">{org.email}</a></>}
            .
          </p>
        )}
      </div>
    </main>
  )
}
