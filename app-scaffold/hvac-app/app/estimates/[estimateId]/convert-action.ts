'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireMutationAccess } from '@/lib/mutation-access'
import { convertAcceptedEstimate, EstimateConversionError } from '@/lib/estimate-conversion'

type Result = { success: true; invoiceId: string } | { success: false; error: string }

export async function createInvoiceFromEstimate(estimateId: string): Promise<Result> {
  const access = await requireMutationAccess('editPricing')
  if (!access.authorized) return { success: false, error: access.error }
  if (!z.string().min(1).max(200).safeParse(estimateId).success) return { success: false, error: 'Invalid estimate' }
  const { organizationId, userId } = access.context
  let invoiceId: string
  try {
    const result = await convertAcceptedEstimate({ estimateId, organizationId, userId })
    invoiceId = result.invoiceId
  } catch (error) {
    if (error instanceof EstimateConversionError) return { success: false, error: error.message }
    console.error('Estimate conversion failed', error)
    return { success: false, error: 'We could not create the invoice. Please try again. Your approved estimate is unchanged.' }
  }
  revalidatePath(`/estimates/${estimateId}`)
  revalidatePath('/invoices')
  return { success: true, invoiceId }
}
