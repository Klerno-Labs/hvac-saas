'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { isValidBookingSlug, resolveBookingOrg } from '@/lib/booking'
import { createBookingRequestSchema } from '@/lib/validations/booking'

const UNAVAILABLE = 'This booking page is not available.'

export async function createBookingRequest(slug: string, formData: FormData) {
  if (!isValidBookingSlug(slug)) {
    return { error: UNAVAILABLE }
  }

  const org = await resolveBookingOrg(slug)
  if (!org) {
    return { error: UNAVAILABLE }
  }

  const parsed = createBookingRequestSchema.safeParse({
    serviceType: formData.get('serviceType'),
    preferredWindow: formData.get('preferredWindow'),
    contactName: formData.get('contactName'),
    contactEmail: formData.get('contactEmail') || undefined,
    contactPhone: formData.get('contactPhone'),
    address: formData.get('address') || undefined,
    notes: formData.get('notes') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const { serviceType, preferredWindow, contactName, contactEmail, contactPhone, address, notes } =
    parsed.data

  const br = await db.bookingRequest.create({
    data: {
      organizationId: org.id,
      serviceType,
      preferredWindow,
      contactName,
      contactEmail: contactEmail || null,
      contactPhone,
      address: address || null,
      notes: notes || null,
      leadSource: 'web',
      status: 'new',
    },
  })

  await trackEvent({
    organizationId: org.id,
    eventName: 'booking_request_created',
    entityType: 'booking_request',
    entityId: br.id,
  })

  return { success: true }
}
