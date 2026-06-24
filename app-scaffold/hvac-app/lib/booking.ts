import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { bookingRequestSchema } from '@/lib/validations/booking'
import { isValidSlug, type ServiceType, type TimeWindow } from '@/lib/lead-source'

/**
 * Rate limit for the public booking endpoint: max submissions per source IP
 * within the rolling window, scoped per organization. DB-backed (no Redis) —
 * adequate at MVP scale and reuses existing infra.
 */
export const BOOKING_RATE_LIMIT_MAX = 5
export const BOOKING_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

type BookableOrg = {
  id: string
  name: string
  tradeType: string
  phone: string | null
  email: string | null
}

/**
 * Resolve an organization from its public booking slug. Only returns orgs that
 * have explicitly enabled online booking and have a valid slug set. This is the
 * single source of truth for org scoping on the public booking path — no client
 * ever supplies an organizationId.
 */
export async function getBookableOrganization(slug: string): Promise<BookableOrg | null> {
  const normalized = slug?.toLowerCase().trim()
  if (!normalized || !isValidSlug(normalized)) return null

  const org = await db.organization.findFirst({
    where: { publicSlug: normalized, bookingEnabled: true },
    select: { id: true, name: true, tradeType: true, phone: true, email: true },
  })
  return org ?? null
}

/**
 * Return true if the source IP is under the per-org rate limit for booking
 * submissions. Null/empty IPs (e.g. local dev) are allowed without throttling.
 */
export async function isWithinBookingRateLimit(
  organizationId: string,
  sourceIp: string | null,
): Promise<boolean> {
  if (!sourceIp) return true

  const since = new Date(Date.now() - BOOKING_RATE_LIMIT_WINDOW_MS)
  const recent = await db.bookingRequest.count({
    where: { organizationId, sourceIp, createdAt: { gt: since } },
  })
  return recent < BOOKING_RATE_LIMIT_MAX
}

type CreateBookingInput = {
  slug: string
  formData: FormData
  sourceIp: string | null
}

type CreateBookingResult =
  | { success: true; requestId: string }
  | { success: false; error: string }

/**
 * Public, unauthenticated creation of a booking request. Resolves the org
 * server-side from the slug only. Enforces honeypot + contact-channel + rate
 * limit before any write. Never throws on validation — returns a result object.
 */
export async function createBookingRequest(input: CreateBookingInput): Promise<CreateBookingResult> {
  const org = await getBookableOrganization(input.slug)
  if (!org) {
    return { success: false, error: 'Online booking is not available.' }
  }

  const raw = {
    slug: input.slug,
    firstName: formDataStr(input.formData, 'firstName'),
    lastName: formDataStr(input.formData, 'lastName'),
    companyName: formDataStr(input.formData, 'companyName'),
    email: formDataStr(input.formData, 'email'),
    phone: formDataStr(input.formData, 'phone'),
    addressLine1: formDataStr(input.formData, 'addressLine1'),
    city: formDataStr(input.formData, 'city'),
    state: formDataStr(input.formData, 'state'),
    postalCode: formDataStr(input.formData, 'postalCode'),
    serviceType: formDataStr(input.formData, 'serviceType'),
    preferredDate: formDataStr(input.formData, 'preferredDate'),
    preferredWindow: formDataStr(input.formData, 'preferredWindow') || 'anytime',
    description: formDataStr(input.formData, 'description'),
    companyUrl: formDataStr(input.formData, 'companyUrl'),
  }

  const parsed = bookingRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }
  const data = parsed.data

  // Honeypot: silently succeed for bots without writing a row.
  if (data.companyUrl) {
    return { success: true, requestId: 'honeypot' }
  }

  const email = data.email?.trim() || null
  const phone = data.phone?.trim() || null
  if (!email && !phone) {
    return { success: false, error: 'Please provide a phone number or email so we can reach you.' }
  }

  const allowed = await isWithinBookingRateLimit(org.id, input.sourceIp)
  if (!allowed) {
    return { success: false, error: 'Too many requests. Please try again later.' }
  }

  const request = await db.bookingRequest.create({
    data: {
      organizationId: org.id,
      customerFirstName: data.firstName.trim(),
      customerLastName: data.lastName?.trim() || null,
      companyName: data.companyName?.trim() || null,
      email,
      phone: phone ?? '',
      addressLine1: data.addressLine1?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      serviceType: data.serviceType,
      preferredDate: data.preferredDate ? new Date(data.preferredDate) : null,
      preferredWindow: (data.preferredWindow as TimeWindow) ?? 'anytime',
      description: data.description?.trim() || null,
      leadSource: 'web_booking',
      sourceIp: input.sourceIp,
    },
  })

  await trackEvent({
    organizationId: org.id,
    eventName: 'booking_request_created',
    entityType: 'booking_request',
    entityId: request.id,
    metadataJson: { serviceType: request.serviceType },
  })

  return { success: true, requestId: request.id }
}

type ConfirmResult =
  | { success: true; requestId: string; customerId: string; jobId: string }
  | { success: false; error: string }

/**
 * Office confirmation: transactionally convert a booking request into a real
 * Customer + Job. De-duplicates against existing customers in the same org by
 * normalized phone or email (excluding soft-deleted), so repeat bookers don't
 * create duplicates. Stamps leadSource='web_booking' on both records.
 */
export async function confirmBookingRequest(input: {
  requestId: string
  organizationId: string
  userId: string
  userEmail: string | null
}): Promise<ConfirmResult> {
  const { requestId, organizationId, userId } = input

  const existing = await db.bookingRequest.findFirst({
    where: { id: requestId, organizationId },
  })
  if (!existing) {
    return { success: false, error: 'Booking request not found.' }
  }
  if (existing.status !== 'new') {
    return { success: false, error: 'This booking request has already been handled.' }
  }

  const normalizedPhone = normalizePhone(existing.phone)

  // Look for an existing (non-deleted) customer matching phone or email.
  const dedupe = await db.customer.findFirst({
    where: {
      organizationId,
      deletedAt: null,
      OR: [
        ...(normalizedPhone ? [{ phone: { equals: normalizedPhone } }, { phone: { equals: existing.phone } }] : []),
        ...(existing.email ? [{ email: { equals: existing.email.toLowerCase() } }] : []),
      ],
    },
  })

  const result = await db.$transaction(async (tx) => {
    const customer =
      dedupe ??
      (await tx.customer.create({
        data: {
          organizationId,
          firstName: existing.customerFirstName,
          lastName: existing.customerLastName,
          companyName: existing.companyName,
          email: existing.email,
          phone: existing.phone,
          addressLine1: existing.addressLine1,
          city: existing.city,
          state: existing.state,
          postalCode: existing.postalCode,
          leadSource: 'web_booking',
          notes: [
            `Submitted via online booking (${existing.serviceType}).`,
            existing.description ? `Customer notes: ${existing.description}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      }))

    const job = await tx.job.create({
      data: {
        organizationId,
        customerId: customer.id,
        title: jobTitleFor(existing.serviceType as ServiceType),
        status: 'draft',
        leadSource: 'web_booking',
        scheduledFor: existing.preferredDate,
        notes: [
          `Created from online booking request.`,
          `Preferred window: ${existing.preferredWindow}.`,
          existing.description ? `Customer notes: ${existing.description}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    })

    const updated = await tx.bookingRequest.update({
      where: { id: requestId },
      data: {
        status: 'confirmed',
        convertedCustomerId: customer.id,
        convertedJobId: job.id,
        handledById: userId,
        handledAt: new Date(),
      },
    })

    return { customer, job, updated }
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'booking_request_confirmed',
    entityType: 'job',
    entityId: result.job.id,
    metadataJson: {
      requestId,
      customerId: result.customer.id,
      reusedCustomer: Boolean(dedupe),
    },
  })

  await logAudit({
    organizationId,
    actorId: userId,
    actorEmail: input.userEmail,
    eventType: 'booking_request_confirmed',
    targetType: 'booking_request',
    targetId: requestId,
    metadata: {
      customerId: result.customer.id,
      jobId: result.job.id,
      reusedCustomer: Boolean(dedupe),
    },
  })

  return {
    success: true,
    requestId,
    customerId: result.customer.id,
    jobId: result.job.id,
  }
}

type RejectResult =
  | { success: true; requestId: string }
  | { success: false; error: string }

export async function rejectBookingRequest(input: {
  requestId: string
  organizationId: string
  userId: string
  userEmail: string | null
  reason?: string
}): Promise<RejectResult> {
  const { requestId, organizationId, userId } = input

  const existing = await db.bookingRequest.findFirst({
    where: { id: requestId, organizationId },
  })
  if (!existing) {
    return { success: false, error: 'Booking request not found.' }
  }
  if (existing.status !== 'new') {
    return { success: false, error: 'This booking request has already been handled.' }
  }

  await db.bookingRequest.update({
    where: { id: requestId },
    data: {
      status: 'rejected',
      handledById: userId,
      handledAt: new Date(),
      rejectionReason: input.reason?.trim() || null,
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'booking_request_rejected',
    entityType: 'booking_request',
    entityId: requestId,
  })

  await logAudit({
    organizationId,
    actorId: userId,
    actorEmail: input.userEmail,
    eventType: 'booking_request_rejected',
    targetType: 'booking_request',
    targetId: requestId,
  })

  return { success: true, requestId }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formDataStr(formData: FormData, key: string): string {
  const value = formData.get(key)
  if (value == null) return ''
  if (typeof value === 'string') return value
  return ''
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

function jobTitleFor(serviceType: ServiceType): string {
  switch (serviceType) {
    case 'repair':
      return 'Repair (online booking)'
    case 'install':
      return 'Installation / replacement (online booking)'
    case 'tune_up':
      return 'Tune-up / maintenance (online booking)'
    case 'inspection':
      return 'Inspection (online booking)'
    case 'emergency':
      return 'Emergency service (online booking)'
    case 'other':
    default:
      return 'Service request (online booking)'
  }
}
