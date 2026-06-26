import { requireActiveSubscription } from '@/lib/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NewMembershipPlanForm } from './form'

export default async function NewMembershipPlanPage() {
  await requireActiveSubscription()

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>New membership plan</CardTitle>
          <CardDescription>Define a service plan customers can subscribe to.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewMembershipPlanForm />
        </CardContent>
      </Card>
    </main>
  )
}
