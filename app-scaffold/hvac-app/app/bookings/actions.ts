'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { generateBookingSlug } from '@/lib/booking'
import { confirmBookingSchema } from '@/lib/validations/booking'
import { revalidatePath } from 'next/cache'

async function requireMembership() {
  const session = await auth()
  if (!session?.user?.id) return null
  return db.organizationMember.findFirst({ where: { userId: session.user.id } })
}

export async function enableBooking() {
  const session = await auth()
  if (!session?.user?.id) return { error: 'You must be logged in' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
  })
  if (!membership) return { error: 'You must belong to an organization' }

  const org = membership.organization

  if (org.bookingSlug) {
    await db.organization.update({
      where: { id: org.id },
      data: { bookingEnabled: true },
    })
    return { success: true, slug: org.bookingSlug }
  }

  let slug = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = generateBookingSlug(org.name)
    const existing = await db.organization.findUnique({ where: { bookingSlug: candidate } })
    if (!existing) {
      slug = candidate
      break
    }
    if (attempt === 2) slug = candidate
  }

  await db.organization.update({
    where: { id: org.id },
    data: { bookingEnabled: true, bookingSlug: slug },
  })

  return { success: true, slug }
}

export async function disableBooking() {
  const membership = await requireMembership()
  if (!membership) return { error: 'You must be logged in' }

  await db.organization.update({
    where: { id: membership.organizationId },
    data: { bookingEnabled: false },
  })

  return { success: true }
}

export async function confirmBookingRequest(bookingRequestId: string, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'You must be logged in' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { error: 'You must belong to an organization' }

  const organizationId = membership.organizationId

  const request = await db.bookingRequest.findFirst({
    where: { id: bookingRequestId, organizationId },
  })
  if (!request) return { error: 'Booking request not found' }

  const parsed = confirmBookingSchema.safeParse({
    leadSource: formData.get('leadSource') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const leadSource = parsed.data.leadSource

  const result = await db.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        organizationId,
        firstName: request.contactName,
        email: request.contactEmail,
        phone: request.contactPhone,
        addressLine1: request.address,
        leadSource,
      },
    })

    const job = await tx.job.create({
      data: {
        organizationId,
        customerId: customer.id,
        title: request.serviceType,
        status: 'draft',
        notes: buildJobNotes(request.preferredWindow, request.notes),
        leadSource,
      },
    })

    await tx.bookingRequest.update({
      where: { id: bookingRequestId },
      data: {
        status: 'confirmed',
        confirmedAt: new Date(),
        customerId: customer.id,
        jobId: job.id,
      },
    })

    return { customerId: customer.id, jobId: job.id }
  })

  await trackEvent({
    organizationId,
    userId: session.user.id,
    eventName: 'booking_request_confirmed',
    entityType: 'booking_request',
    entityId: bookingRequestId,
  })

  revalidatePath('/bookings')
  return { success: true, ...result }
}

export async function declineBookingRequest(bookingRequestId: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'You must be logged in' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { error: 'You must belong to an organization' }

  const organizationId = membership.organizationId

  const request = await db.bookingRequest.findFirst({
    where: { id: bookingRequestId, organizationId },
  })
  if (!request) return { error: 'Booking request not found' }

  await db.bookingRequest.update({
    where: { id: bookingRequestId },
    data: { status: 'declined', declinedAt: new Date() },
  })

  await trackEvent({
    organizationId,
    userId: session.user.id,
    eventName: 'booking_request_declined',
    entityType: 'booking_request',
    entityId: bookingRequestId,
  })

  revalidatePath('/bookings')
  return { success: true }
}

export function buildJobNotes(preferredWindow: string, requestNotes: string | null): string {
  const parts = [`Preferred window: ${preferredWindow}`]
  if (requestNotes) parts.push(requestNotes)
  return parts.join('\n\n')
}
