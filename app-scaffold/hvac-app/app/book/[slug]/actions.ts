import { headers } from 'next/headers'
import { createBookingRequest } from '@/lib/booking'

type SubmitResult =
  | { success: true; requestId: string }
  | { success: false; error: string }

/**
 * Public (unauthenticated) server action. The organization is resolved
 * server-side from the slug only — no client-supplied organizationId is ever
 * trusted, preserving multi-tenant isolation on the public path.
 */
export async function submitBooking(slug: string, formData: FormData): Promise<SubmitResult> {
  const headerList = await headers()
  const sourceIp =
    headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headerList.get('x-real-ip') ||
    null

  const result = await createBookingRequest({ slug, formData, sourceIp })
  if (result.success) {
    return { success: true, requestId: result.requestId }
  }
  return { success: false, error: result.error }
}
