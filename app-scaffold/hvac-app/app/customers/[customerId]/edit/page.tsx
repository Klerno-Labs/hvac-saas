import { requirePageCapability } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { EditCustomerForm } from './form'

export default async function EditCustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { organizationId } = await requirePageCapability('manageCustomers')
  const { customerId } = await params

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null },
  })

  if (!customer) {
    notFound()
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <EditCustomerForm customer={customer} />
    </main>
  )
}
