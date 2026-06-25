import Link from 'next/link'

export type ReadOnlyReasonKey =
  | 'trial_expired'
  | 'subscription_canceled'
  | 'payment_past_due'
  | 'subscription_unpaid'
  | 'inactive'

const REASON_LABEL: Record<ReadOnlyReasonKey, string> = {
  trial_expired: 'your trial has expired',
  subscription_canceled: 'your subscription was canceled',
  payment_past_due: 'a payment is past due',
  subscription_unpaid: 'your subscription is unpaid',
  inactive: 'your subscription is inactive',
}

/**
 * Persistent global banner shown to read-only / frozen organizations. Renders
 * nothing when the org is writable. Pure presentational component (no server-only
 * imports) so it can be rendered directly in tests.
 */
export function ReadOnlyBanner({
  reason = 'inactive',
  show = true,
}: {
  reason?: ReadOnlyReasonKey
  show?: boolean
}) {
  if (!show) return null
  return (
    <div
      data-testid="read-only-banner"
      role="alert"
      className="w-full text-center text-sm py-1.5 px-4 bg-destructive text-destructive-foreground"
    >
      Your account is read-only — {REASON_LABEL[reason]}.{' '}
      <Link
        href="/settings/billing"
        className="underline font-semibold hover:opacity-80"
      >
        Reactivate to continue.
      </Link>
    </div>
  )
}
