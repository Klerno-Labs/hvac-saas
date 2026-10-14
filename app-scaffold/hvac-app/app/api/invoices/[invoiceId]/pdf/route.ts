import { jobAccessWhere } from '@/lib/mutation-access'
import { canDo } from '@/lib/permissions'
import type { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { validatePortalToken } from '@/lib/portal'
import { InvoicePdf } from '@/lib/pdf/invoice-pdf'

export const runtime = 'nodejs'

function buildCustomerAddress(c: { addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null }): string {
  const parts = [c.addressLine1, c.addressLine2, [c.city, c.state].filter(Boolean).join(', '), c.postalCode].filter(Boolean)
  return parts.join('\n')
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await ctx.params
  const portalToken = req.nextUrl.searchParams.get('token')

  let organizationId: string | null = null
  let customerIdFilter: string | null = null
  let assignedJobFilter: Prisma.JobWhereInput | undefined
  let canReadDrafts = false

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
    if (!canDo(membership.role, 'fieldWork')) return new NextResponse('Forbidden', { status: 403 })
    canReadDrafts = canDo(membership.role, 'editPricing')
    organizationId = membership.organizationId
    assignedJobFilter = jobAccessWhere({ organizationId, userId: session.user.id, role: membership.role })
  }

  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId,
      ...(!canReadDrafts ? { status: { not: 'draft' } } : {}),
      ...(customerIdFilter ? { customerId: customerIdFilter, status: { not: 'draft' } } : { job: assignedJobFilter }),
    },
    include: {
      customer: true,
      lineItems: { orderBy: { sortOrder: 'asc' } },
      organization: true,
    },
  })

  if (!invoice) return new NextResponse('Not found', { status: 404 })

  const customerName = [invoice.customer.firstName, invoice.customer.lastName].filter(Boolean).join(' ')

  // Every PDF is a shareable customer document, including staff downloads.
  // Keep internal notes out of the renderer's input.
  const buffer = await renderToBuffer(
    InvoicePdf({
      orgName: invoice.organization.name,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      createdAt: invoice.createdAt,
      dueDate: invoice.dueDate,
      customerName,
      customerAddress: buildCustomerAddress(invoice.customer),
      customerEmail: invoice.customer.email,
      customerPhone: invoice.customer.phone,
      descriptionOfWork: invoice.descriptionOfWork,
      lineItems: invoice.lineItems,
      subtotalCents: invoice.subtotalCents,
      taxCents: invoice.taxCents,
      totalCents: invoice.totalCents,
      outstandingCents: invoice.outstandingCents,
    }),
  )

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Disposition': `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
    },
  })
}
