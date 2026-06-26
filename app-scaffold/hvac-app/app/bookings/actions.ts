'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import crypto from 'crypto'

async function getOrgContext() {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
  })
  if (!membership) throw new Error('No organization')

  return { organizationId: membership.organizationId, organization: membership.organization }
}

export async function enableBooking() {
  const { organizationId, organization } = await getOrgContext()

  const slug = organization.bookingSlug ?? crypto.randomBytes(6).toString('hex')

  await db.organization.update({
    where: { id: organizationId },
    data: { bookingEnabled: true, bookingSlug: slug },
  })

  revalidatePath('/bookings')
}

export async function disableBooking() {
  const { organizationId } = await getOrgContext()

  await db.organization.update({
    where: { id: organizationId },
    data: { bookingEnabled: false },
  })

  revalidatePath('/bookings')
}

export async function confirmBookingRequest(id: string, formData: FormData) {
  const { organizationId } = await getOrgContext()

  const booking = await db.bookingRequest.findFirst({
    where: { id, organizationId },
  })
  if (!booking) throw new Error('Booking request not found')
  if (booking.status !== 'new') throw new Error('Booking already handled')

  const leadSource = (formData.get('leadSource') as string | null) ?? 'web'

  const nameParts = booking.contactName.trim().split(/\s+/)
  const firstName = nameParts[0]
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

  const customer = await db.customer.create({
    data: {
      organizationId,
      firstName,
      lastName,
      phone: booking.contactPhone,
      email: booking.contactEmail,
      addressLine1: booking.address,
      leadSource,
    },
  })

  const job = await db.job.create({
    data: {
      organizationId,
      customerId: customer.id,
      title: booking.serviceType,
      notes: booking.notes,
      leadSource,
    },
  })

  await db.bookingRequest.update({
    where: { id },
    data: { status: 'confirmed', customerId: customer.id, jobId: job.id, leadSource },
  })

  revalidatePath('/bookings')
}

export async function declineBookingRequest(id: string) {
  const { organizationId } = await getOrgContext()

  await db.bookingRequest.updateMany({
    where: { id, organizationId },
    data: { status: 'declined' },
  })

  revalidatePath('/bookings')
}
