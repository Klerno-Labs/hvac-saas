import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { NewJobForm } from './form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { organizationId } = await requireActiveSubscription()
  const { customerId } = await searchParams

  const customers = await db.customer.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { firstName: 'asc' },
    select: { id: true, firstName: true, lastName: true, companyName: true },
  })

  const technicians = await db.technician.findMany({
    where: { organizationId, active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>New job</CardTitle>
          <CardDescription>Create a job for one of your customers.</CardDescription>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <p className="text-sm">
              You need to <Link href="/customers/new" className="text-primary hover:underline">add a customer</Link> first.
            </p>
          ) : (
            <NewJobForm customers={customers} technicians={technicians} preselectedCustomerId={customerId} />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
