import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ManageBillingButton } from './manage-billing-button'
import type { Entitlements, UsageRow } from '@/lib/entitlements'

const STATUS_LABEL: Record<string, string> = {
  TRIALING: 'Trialing',
  ACTIVE: 'Active',
  PAST_DUE: 'Past due',
  CANCELED: 'Canceled',
  UNPAID: 'Unpaid',
  INCOMPLETE: 'Incomplete',
}

const READ_ONLY_REASON_LABEL: Record<string, string> = {
  trial_expired: 'your trial has expired',
  subscription_canceled: 'your subscription was canceled',
  payment_past_due: 'a payment is past due',
  subscription_unpaid: 'your subscription is unpaid',
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'ACTIVE' || status === 'TRIALING') return 'default'
  if (status === 'PAST_DUE' || status === 'UNPAID' || status === 'INCOMPLETE') return 'destructive'
  return 'secondary'
}

/** A usage row is "at risk" at 80%+ of cap (or over cap). */
export function isAtRisk(used: number, cap: number): boolean {
  if (cap <= 0) return false
  return used / cap >= 0.8
}

/**
 * Presentational billing summary. Receives only narrow display DTOs — never a
 * raw Prisma row, never Stripe ids. Pure (no server-only imports) so it can be
 * rendered directly in tests.
 */
export function BillingOverview({
  entitlements,
  usage,
}: {
  entitlements: Entitlements
  usage: UsageRow[]
}) {
  const { plan, status, isReadOnly, readOnlyReason, trialEndsAt, trialDaysRemaining, trialExpired } =
    entitlements

  return (
    <div className="space-y-6">
      {isReadOnly && (
        <Card
          data-testid="readonly-upsell"
          className="ring-destructive/30 bg-destructive/5"
        >
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-destructive">
              Your account is read-only —{' '}
              {readOnlyReason ? READ_ONLY_REASON_LABEL[readOnlyReason] : 'your subscription is inactive'}.{' '}
              <Link href="/settings/billing" className="underline font-semibold">
                Reactivate to continue.
              </Link>
            </p>
            <div className="shrink-0">
              <ManageBillingButton />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>Your subscription and billing status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span data-testid="plan-name" className="text-lg font-bold capitalize">
              {plan.toLowerCase()}
            </span>
            <Badge variant={statusVariant(status)} data-testid="status-badge">
              {STATUS_LABEL[status] ?? status}
            </Badge>
            {isReadOnly && (
              <Badge variant="destructive" data-testid="readonly-badge">
                Read-only
              </Badge>
            )}
          </div>

          {status === 'TRIALING' &&
            (trialExpired ? (
              <p data-testid="trial-expired" className="text-sm font-medium text-destructive">
                Your trial has expired.
              </p>
            ) : trialEndsAt ? (
              <p data-testid="trial-remaining" className="text-sm text-muted-foreground">
                Trial ends{' '}
                {new Date(trialEndsAt).toLocaleDateString()}
                {trialDaysRemaining !== null && trialDaysRemaining > 0
                  ? ` — ${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} left`
                  : ' — trial expired'}
                .
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Free beta — no trial expiration set.
              </p>
            ))}

          <ManageBillingButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage this period</CardTitle>
          <CardDescription>
            Usage against your {plan.toLowerCase()} plan limits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.map((row) => {
                const atRisk = isAtRisk(row.used, row.cap)
                const over = row.used >= row.cap
                return (
                  <TableRow
                    key={row.limitKey}
                    data-testid={`usage-row-${row.limitKey}`}
                    data-at-risk={atRisk ? 'true' : 'false'}
                    data-over-cap={over ? 'true' : 'false'}
                    className={atRisk ? 'bg-destructive/5' : ''}
                  >
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${over ? 'text-destructive font-semibold' : ''}`}
                    >
                      {row.used}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.cap}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
