'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { trackEvent } from '@/lib/events'
import { randomBytes } from 'crypto'

type ActionResult = { success: true } | { success: false; error: string }

async function getOrgContext() {
  const session = await auth()
  if (!session?.user?.id) return null
  const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!membership) return null
  return { userId: session.user.id, organizationId: membership.organizationId }
}

export async function enableBooking(): Promise<ActionResult> {
  const ctx = await getOrgContext()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const org = await db.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { bookingSlug: true },
  })
  if (!org) return { success: false, error: 'Organization not found' }

  const slug = org.bookingSlug ?? randomBytes(8).toString('hex')
  await db.organization.update({
    where: { id: ctx.organizationId },
    data: { bookingEnabled: true, bookingSlug: slug },
  })
  revalidatePath('/bookings')
  return { success: true }
}

export async function disableBooking(): Promise<ActionResult> {
  const ctx = await getOrgContext()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  await db.organization.update({
    where: { id: ctx.organizationId },
    data: { bookingEnabled: false },
  })
  revalidatePath('/bookings')
  return { success: true }
}

export async function confirmBookingRequest(id: string, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const request = await db.bookingRequest.findFirst({
    where: { id, organizationId: ctx.organizationId, status: 'new' },
  })
  if (!request) return { success: false, error: 'Booking request not found' }

  const leadSource = (formData.get('leadSource') as string | null) || 'web'

  const nameParts = request.contactName.trim().split(/\s+/)
  const firstName = nameParts[0] ?? 'Unknown'
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

  const noteParts = [
    request.preferredWindow ? `Preferred window: ${request.preferredWindow}` : null,
    request.notes,
  ].filter(Boolean)

  const customer = await db.customer.create({
    data: {
      organizationId: ctx.organizationId,
      firstName,
      lastName,
      phone: request.phone,
      email: request.email,
      addressLine1: request.addressLine1,
      city: request.city,
      state: request.state,
      postalCode: request.postalCode,
      leadSource,
    },
  })

  const job = await db.job.create({
    data: {
      organizationId: ctx.organizationId,
      customerId: customer.id,
      title: request.serviceType,
      notes: noteParts.length > 0 ? noteParts.join('\n') : null,
      leadSource,
    },
  })

  await db.bookingRequest.update({
    where: { id },
    data: { status: 'confirmed', customerId: customer.id, jobId: job.id, leadSource },
  })

  await trackEvent({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventName: 'booking_request_confirmed',
    entityType: 'booking_request',
    entityId: id,
  })

  revalidatePath('/bookings')
  return { success: true }
}

export async function declineBookingRequest(id: string): Promise<ActionResult> {
  const ctx = await getOrgContext()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const request = await db.bookingRequest.findFirst({
    where: { id, organizationId: ctx.organizationId, status: 'new' },
  })
  if (!request) return { success: false, error: 'Booking request not found' }

  await db.bookingRequest.update({
    where: { id },
    data: { status: 'declined' },
  })

  await trackEvent({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventName: 'booking_request_declined',
    entityType: 'booking_request',
    entityId: id,
  })

  revalidatePath('/bookings')
  return { success: true }
}
