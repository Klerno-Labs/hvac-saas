import { requireAuth } from '@/lib/session'
import { PLANS, isSubscriptionActive } from '@/lib/billing'
import { getEntitlements, getUsage } from '@/lib/entitlements'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SubscribeButton } from './subscribe-button'
import { BillingOverview } from './billing-overview'

export default async function BillingPage() {
  // Settings use requireAuth (not requireActiveSubscription) so frozen/read-only
  // orgs can still reach this page to reactivate.
  const { organization, user } = await requireAuth()

  const [entitlements, usage] = await Promise.all([
    getEntitlements(organization.id),
    getUsage(organization.id),
  ])

  const isActive = isSubscriptionActive(organization)

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="mb-8">
        <Link href="/settings" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
          &larr; Back to settings
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">{organization.name}</p>
      </div>

      <BillingOverview entitlements={entitlements} usage={usage} />

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        {(Object.entries(PLANS) as [string, typeof PLANS[keyof typeof PLANS]][]).map(([planId, plan]) => (
          <Card key={planId} className={organization.plan.toLowerCase() === planId ? 'border-primary border-2' : ''}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>
                <span className="text-2xl font-bold text-foreground">${(plan.priceMonthly / 100).toFixed(0)}</span>
                <span className="text-muted-foreground">/month</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm flex items-center gap-2">
                    <span className="text-primary">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              {organization.plan.toLowerCase() === planId && isActive ? (
                <Badge variant="outline" className="w-full justify-center py-2">Current plan</Badge>
              ) : (
                <SubscribeButton planId={planId} userEmail={user.email || ''} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Platform fee</CardTitle>
          <CardDescription>
            A {organization.platformFeePercent}% processing fee is applied to each payment collected through the platform.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  )
}
