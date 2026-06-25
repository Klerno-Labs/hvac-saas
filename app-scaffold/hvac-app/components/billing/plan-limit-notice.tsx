import Link from 'next/link'

/**
 * Reusable inline upsell shown when a write is blocked by a plan limit. Maps
 * the canonical server-action error shape `{ ok: false, error: 'plan_limit' }`
 * to a user-facing call to action. Drop this into any create form's error state.
 */
export function PlanLimitNotice({
  message = "You've hit your plan limit — upgrade to continue.",
}: {
  message?: string
}) {
  return (
    <div
      data-testid="plan-limit-notice"
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {message}{' '}
      <Link href="/settings/billing" className="underline font-semibold">
        Upgrade plan
      </Link>
    </div>
  )
}
