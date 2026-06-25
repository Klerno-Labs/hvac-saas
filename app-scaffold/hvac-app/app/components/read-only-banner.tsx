import Link from 'next/link'

export function ReadOnlyBanner({ reason }: { reason: string }) {
  return (
    <div className="w-full bg-destructive text-destructive-foreground text-sm text-center py-1.5 px-4">
      {reason} — your account is read-only.{' '}
      <Link href="/settings/billing" className="underline font-semibold hover:opacity-80">
        Reactivate
      </Link>{' '}
      to continue.
    </div>
  )
}
