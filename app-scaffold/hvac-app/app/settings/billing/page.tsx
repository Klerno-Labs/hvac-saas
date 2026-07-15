import { requireAuth } from '@/lib/session'
import { getEntitlements } from '@/lib/entitlements'
import { PLANS } from '@/lib/billing'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ManageBillingButton } from './manage-billing-button'
import { SubscribeButton } from './subscribe-button'

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  TRIALING:   { label: 'Trial',      variant: 'secondary'   },
  ACTIVE:     { label: 'Active',     variant: 'default'     },
  PAST_DUE:   { label: 'Past due',   variant: 'destructive' },
  CANCELED:   { label: 'Canceled',   variant: 'destructive' },
  UNPAID:     { label: 'Unpaid',     variant: 'destructive' },
  INCOMPLETE: { label: 'Incomplete', variant: 'destructive' },
}

export default async function BillingPage() {
  const { organization, user } = await requireAuth()
  const ent = await getEntitlements(organization.id)

  const statusConfig = STATUS_CONFIG[ent.status] ?? { label: ent.status, variant: 'outline' as const }
  const hasStripeCustomer = Boolean(organization.stripeCustomerId)

  const trialText =
    ent.status === 'TRIALING' && ent.trialEndsAt !== null
      ? ent.trialDaysLeft === 0
        ? 'Trial expired'
        : ent.trialDaysLeft === 1
          ? '1 day left in trial'
          : `${ent.trialDaysLeft} days left in trial`
      : null

  const seats = ent.limits.teamSeats
  const seatsAtRisk = seats.cap !== null && seats.used >= seats.cap

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
          <div className="flex items-center gap-3">
            <CardTitle>Current plan</CardTitle>
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>
          {trialText && (
            <CardDescription className={ent.trialDaysLeft === 0 ? 'text-destructive' : undefined}>
              {trialText}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-lg font-bold capitalize mb-4">{ent.plan.toLowerCase()}</p>
          {hasStripeCustomer && <ManageBillingButton />}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium text-muted-foreground">Feature</th>
                <th className="text-right py-2 font-medium text-muted-foreground">Used</th>
                <th className="text-right py-2 font-medium text-muted-foreground">Limit</th>
              </tr>
            </thead>
            <tbody>
              <tr className={`border-b last:border-0 ${seatsAtRisk ? 'text-destructive font-medium' : ''}`}>
                <td className="py-2">
                  Team seats
                  {seatsAtRisk && seats.cap !== null && seats.used > seats.cap && (
                    <span className="ml-2 text-xs">(over limit — upgrade to add more)</span>
                  )}
                </td>
                <td className="py-2 text-right">{seats.used}</td>
                <td className="py-2 text-right">{seats.cap === null ? 'Unlimited' : seats.cap}</td>
              </tr>
            </tbody>
          </table>
          {seatsAtRisk && (
            <p className="text-xs text-destructive mt-3">
              You&apos;ve reached your plan limit.{' '}
              <Link href="/settings/billing" className="underline font-semibold">Upgrade</Link>{' '}
              to add more team members.
            </p>
          )}
        </CardContent>
      </Card>

      {!hasStripeCustomer && (
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {(Object.entries(PLANS) as [string, typeof PLANS[keyof typeof PLANS]][]).map(([planId, plan]) => (
            <Card key={planId} className={ent.plan.toLowerCase() === planId ? 'ring-2 ring-primary' : ''}>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">${(plan.priceMonthly / 100).toFixed(0)}</span>
                  /month
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
                {ent.plan.toLowerCase() === planId && ent.isActive ? (
                  <Badge variant="outline" className="w-full justify-center py-2">Current plan</Badge>
                ) : (
                  <SubscribeButton planId={planId} userEmail={user.email || ''} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Platform fee</CardTitle>
          <CardDescription>
            A {organization.platformFeePercent}% processing fee is applied to each payment collected through the platform.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  )
}
