'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  confirmBookingRequest,
  rejectBookingRequest,
} from '@/lib/booking'

type Result =
  | { success: true; jobId?: string; customerId?: string }
  | { success: false; error: string }

async function getMembership() {
  const session = await auth()
  if (!session?.user?.id) return null
  const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!membership) return null
  return { userId: session.user.id, userEmail: session.user.email ?? null, organizationId: membership.organizationId }
}

export async function confirmRequest(requestId: string): Promise<Result> {
  const m = await getMembership()
  if (!m) return { success: false, error: 'You must be logged in' }

  const result = await confirmBookingRequest({
    requestId,
    organizationId: m.organizationId,
    userId: m.userId,
    userEmail: m.userEmail,
  })
  if (result.success) {
    return { success: true, jobId: result.jobId, customerId: result.customerId }
  }
  return { success: false, error: result.error }
}

export async function rejectRequest(requestId: string, reason?: string): Promise<Result> {
  const m = await getMembership()
  if (!m) return { success: false, error: 'You must be logged in' }

  const result = await rejectBookingRequest({
    requestId,
    organizationId: m.organizationId,
    userId: m.userId,
    userEmail: m.userEmail,
    reason,
  })
  if (result.success) return { success: true }
  return { success: false, error: result.error }
}
