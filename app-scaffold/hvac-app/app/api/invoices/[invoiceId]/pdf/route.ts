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

  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId,
      ...(customerIdFilter ? { customerId: customerIdFilter } : {}),
    },
    include: {
      customer: true,
      lineItems: { orderBy: { sortOrder: 'asc' } },
      organization: true,
    },
  })

  if (!invoice) return new NextResponse('Not found', { status: 404 })

  const customerName = [invoice.customer.firstName, invoice.customer.lastName].filter(Boolean).join(' ')

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
      taxRateBps: invoice.lineItems.find((li) => li.taxable && li.taxRateBps > 0)?.taxRateBps,
      totalCents: invoice.totalCents,
      outstandingCents: invoice.outstandingCents,
      notes: invoice.notes,
    }),
  )

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
    },
  })
}
