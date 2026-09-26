import { requirePageCapability } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { NewEquipmentForm } from './form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function NewEquipmentPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { organizationId } = await requirePageCapability('manageCustomers')
  const { customerId } = await params

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, companyName: true },
  })
  if (!customer) notFound()

  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(' ')

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href={`/customers/${customer.id}` as never}
        className="text-sm text-muted-foreground hover:underline mb-4 inline-block"
      >
        &larr; {customerName}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Add equipment</CardTitle>
          <CardDescription>Track an HVAC unit at this customer&apos;s property.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewEquipmentForm customerId={customer.id} />
        </CardContent>
      </Card>
    </main>
  )
}
