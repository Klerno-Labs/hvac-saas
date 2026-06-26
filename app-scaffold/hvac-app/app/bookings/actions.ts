'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { generateBookingSlug, buildJobNotes } from '@/lib/booking'
import { confirmBookingSchema } from '@/lib/validations/booking'

export async function enableBooking() {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { error: 'No organization found' }

  const { organizationId } = membership

  const org = await db.organization.findFirst({
    where: { id: organizationId },
    select: { bookingSlug: true, name: true },
  })
  if (!org) return { error: 'Organization not found' }

  if (org.bookingSlug !== null) {
    await db.organization.update({
      where: { id: organizationId },
      data: { bookingEnabled: true },
    })
    return { success: true, slug: org.bookingSlug }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateBookingSlug(org.name)
    try {
      await db.organization.update({
        where: { id: organizationId },
        data: { bookingEnabled: true, bookingSlug: slug },
      })
      return { success: true, slug }
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue
      throw e
    }
  }
  return { error: 'Could not generate a unique booking URL. Please try again.' }
}

export async function disableBooking() {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { error: 'No organization found' }

  const { organizationId } = membership

  await db.organization.update({
    where: { id: organizationId },
    data: { bookingEnabled: false },
  })

  return { success: true }
}

export async function confirmBookingRequest(bookingRequestId: string, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { error: 'No organization found' }

  const { organizationId } = membership

  const br = await db.bookingRequest.findFirst({
    where: { id: bookingRequestId, organizationId },
  })
  if (!br) return { error: 'Booking request not found' }

  const parsed = confirmBookingSchema.safeParse({
    leadSource: formData.get('leadSource') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { leadSource } = parsed.data

  const [firstName, ...rest] = br.contactName.split(' ')
  const lastName = rest.join(' ') || null

  const { customerId, jobId } = await db.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        organizationId,
        firstName,
        lastName,
        email: br.contactEmail || null,
        phone: br.contactPhone,
        addressLine1: br.address || null,
        leadSource,
      },
    })

    const job = await tx.job.create({
      data: {
        organizationId,
        customerId: customer.id,
        title: br.serviceType,
        status: 'draft',
        notes: buildJobNotes(br.preferredWindow, br.notes),
        leadSource,
      },
    })

    await tx.bookingRequest.update({
      where: { id: br.id },
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

  return { success: true, customerId, jobId }
}

export async function declineBookingRequest(bookingRequestId: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { error: 'No organization found' }

  const { organizationId } = membership

  const br = await db.bookingRequest.findFirst({
    where: { id: bookingRequestId, organizationId },
  })
  if (!br) return { error: 'Booking request not found' }

  await db.bookingRequest.update({
    where: { id: br.id },
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
