'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createCustomerSchema } from '@/lib/validations/customer'

type ActionResult = { success: true } | { success: false; error: string }

export async function updateCustomer(customerId: string, formData: FormData): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'You must be logged in' }

  const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!membership) return { success: false, error: 'You must belong to an organization' }

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId: membership.organizationId },
  })
  if (!customer) return { success: false, error: 'Customer not found' }

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
    taxExempt: formData.get('taxExempt') === 'on',
  }

  const parsed = createCustomerSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data
  await db.customer.update({
    where: { id: customerId },
    data: {
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
      taxExempt: data.taxExempt,
    },
  })

  await trackEvent({
    organizationId: membership.organizationId,
    userId: session.user.id,
    eventName: 'customer_updated',
    entityType: 'customer',
    entityId: customerId,
  })

  return { success: true }
}

export async function deleteCustomer(customerId: string): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'You must be logged in' }

  const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!membership) return { success: false, error: 'You must belong to an organization' }

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId: membership.organizationId, deletedAt: null },
  })
  if (!customer) return { success: false, error: 'Customer not found' }

  await db.customer.update({
    where: { id: customerId },
    data: { deletedAt: new Date() },
  })

  await trackEvent({
    organizationId: membership.organizationId,
    userId: session.user.id,
    eventName: 'customer_deleted',
    entityType: 'customer',
    entityId: customerId,
  })

  return { success: true }
}
