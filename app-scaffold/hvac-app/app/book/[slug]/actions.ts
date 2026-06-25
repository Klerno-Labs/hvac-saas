'use server'

import { db } from '@/lib/db'
import { resolveBookingOrg } from '@/lib/booking'
import { createBookingRequestSchema } from '@/lib/validations/booking'

export async function createBookingRequest(slug: string, formData: FormData) {
  const org = await resolveBookingOrg(slug)
  if (!org) {
    return { error: 'Booking is not available.' }
  }

  const parsed = createBookingRequestSchema.safeParse({
    serviceType: formData.get('serviceType'),
    preferredWindow: formData.get('preferredWindow'),
    contactName: formData.get('contactName'),
    contactPhone: formData.get('contactPhone'),
    contactEmail: formData.get('contactEmail') || undefined,
    address: formData.get('address') || undefined,
    notes: formData.get('notes') || undefined,
  })

  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: first?.message ?? 'Please check the form fields.' }
  }

  await db.bookingRequest.create({
    data: {
      organizationId: org.id,
      serviceType: parsed.data.serviceType,
      preferredWindow: parsed.data.preferredWindow,
      contactName: parsed.data.contactName,
      contactPhone: parsed.data.contactPhone,
      contactEmail: parsed.data.contactEmail || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    },
  })

  return { success: true as const }
}
