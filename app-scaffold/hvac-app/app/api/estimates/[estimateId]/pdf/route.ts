import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { validatePortalToken } from '@/lib/portal'
import { EstimatePdf } from '@/lib/pdf/estimate-pdf'

export const runtime = 'nodejs'

function buildCustomerAddress(c: { addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null }): string {
  const parts = [c.addressLine1, c.addressLine2, [c.city, c.state].filter(Boolean).join(', '), c.postalCode].filter(Boolean)
  return parts.join('\n')
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = await ctx.params
  const portalToken = req.nextUrl.searchParams.get('token')

  let organizationId: string | null = null
  let customerIdFilter: string | null = null

  if (portalToken) {
    const ctxToken = await validatePortalToken(portalToken)
    if (!ctxToken) return new NextResponse('Unauthorized', { status: 401 })
    organizationId = ctxToken.organizationId
    customerIdFilter = ctxToken.customerId
  } else {
    const session = await auth()
    if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 })
    const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
    if (!membership) return new NextResponse('Forbidden', { status: 403 })
    organizationId = membership.organizationId
  }

  const estimate = await db.estimate.findFirst({
    where: {
      id: estimateId,
      organizationId,
      ...(customerIdFilter ? { job: { customerId: customerIdFilter } } : {}),
    },
    include: {
      job: { include: { customer: true } },
      lineItems: { orderBy: { sortOrder: 'asc' } },
      organization: true,
    },
  })

  if (!estimate) return new NextResponse('Not found', { status: 404 })

  const customerName = [estimate.job.customer.firstName, estimate.job.customer.lastName].filter(Boolean).join(' ')

  const buffer = await renderToBuffer(
    EstimatePdf({
      orgName: estimate.organization.name,
      estimateNumber: estimate.estimateNumber,
      status: estimate.status,
      createdAt: estimate.createdAt,
      customerName,
      customerAddress: buildCustomerAddress(estimate.job.customer),
      customerEmail: estimate.job.customer.email,
      customerPhone: estimate.job.customer.phone,
      scopeOfWork: estimate.scopeOfWork,
      terms: estimate.terms,
      notes: estimate.notes,
      lineItems: estimate.lineItems,
      subtotalCents: estimate.subtotalCents,
      taxCents: estimate.taxCents,
      taxRateBps: estimate.lineItems.find((li) => li.taxable && li.taxRateBps > 0)?.taxRateBps,
      totalCents: estimate.totalCents,
    }),
  )

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="estimate-${estimate.estimateNumber}.pdf"`,
    },
  })
}
