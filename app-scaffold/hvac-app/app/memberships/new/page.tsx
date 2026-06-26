import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EnrollMembershipForm } from './form'

export default async function NewMembershipPage() {
  const { organizationId } = await requireActiveSubscription()

  const [plans, customers] = await Promise.all([
    db.membershipPlan.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, cadence: true, visitsPerYear: true },
    }),
    db.customer.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { firstName: 'asc' },
      select: { id: true, firstName: true, lastName: true, companyName: true },
    }),
  ])

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Enroll customer in membership</CardTitle>
          <CardDescription>Select a plan and customer to create a membership.</CardDescription>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-sm">
              You need to <Link href="/memberships/plans/new" className="text-primary hover:underline">create a plan</Link> first.
            </p>
          ) : customers.length === 0 ? (
            <p className="text-sm">
              You need to <Link href="/customers/new" className="text-primary hover:underline">add a customer</Link> first.
            </p>
          ) : (
            <EnrollMembershipForm plans={plans} customers={customers} />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
