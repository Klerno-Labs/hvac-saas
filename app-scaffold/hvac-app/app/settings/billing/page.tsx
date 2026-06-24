import { requireAuth } from '@/lib/session'
import { PLANS, isSubscriptionActive } from '@/lib/billing'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SubscribeButton } from './subscribe-button'

export default async function BillingPage() {
  const { organization, userId, user } = await requireAuth()

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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold capitalize">{organization.plan.toLowerCase()}</span>
            <Badge variant={isActive ? 'default' : 'destructive'}>
              {organization.subscriptionStatus === 'TRIALING' ? 'Trial' : organization.subscriptionStatus.toLowerCase()}
            </Badge>
          </div>
          {organization.trialEndsAt && organization.subscriptionStatus === 'TRIALING' && (
            <p className="text-sm text-muted-foreground mt-2">
              Trial ends {new Date(organization.trialEndsAt).toLocaleDateString()}
            </p>
          )}
          {!organization.trialEndsAt && organization.subscriptionStatus === 'TRIALING' && (
            <p className="text-sm text-muted-foreground mt-2">
              Free beta — no trial expiration set
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
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
