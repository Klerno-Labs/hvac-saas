'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createCustomerSchema } from '@/lib/validations/customer'
import { assertCanWrite, assertWithinLimit, handleGuardError } from '@/lib/billing-guard'

type CreateCustomerResult =
  | { success: true; customerId: string }
  | { success: false; error: string }

export async function createCustomer(formData: FormData): Promise<CreateCustomerResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const userId = session.user.id

  const membership = await db.organizationMember.findFirst({
    where: { userId },
  })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }

  const organizationId = membership.organizationId

  try {
    await assertCanWrite(organizationId)
    await assertWithinLimit(organizationId, 'maxActiveCustomers')
  } catch (e) {
    const guard = handleGuardError(e)
    if (guard) return guard
    throw e
  }

  const raw = {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName') || undefined,
    companyName: formData.get('companyName') || undefined,
    email: formData.get('email') || undefined,
    phone: formData.get('phone'),
    addressLine1: formData.get('addressLine1') || undefined,
    addressLine2: formData.get('addressLine2') || undefined,
    city: formData.get('city') || undefined,
    state: formData.get('state') || undefined,
    postalCode: formData.get('postalCode') || undefined,
    notes: formData.get('notes') || undefined,
  }

  const parsed = createCustomerSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  const customer = await db.customer.create({
    data: {
      organizationId,
      firstName: data.firstName,
      lastName: data.lastName || null,
      companyName: data.companyName || null,
      email: data.email || null,
      phone: data.phone,
      addressLine1: data.addressLine1 || null,
      addressLine2: data.addressLine2 || null,
      city: data.city || null,
      state: data.state || null,
      postalCode: data.postalCode || null,
      notes: data.notes || null,
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'customer_created',
    entityType: 'customer',
    entityId: customer.id,
  })

  return { success: true, customerId: customer.id }
}
