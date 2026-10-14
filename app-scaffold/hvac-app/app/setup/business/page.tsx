import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/session'
import { canDo } from '@/lib/permissions'
import { isSubscriptionActive } from '@/lib/billing'
import { isConfiguredBusinessTimezone } from '@/lib/validations/business-profile'
import { BusinessProfileForm } from './form'

export default async function BusinessProfilePage() {
  const { organization, role } = await requireAuth()
  if (!canDo(role, 'manageBilling')) redirect('/field')
  const timezones = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone'), ...(isConfiguredBusinessTimezone(organization.timezone) ? [organization.timezone] : [])])].sort()
  return (
    <main className="workspace-page">
      <div className="workspace-heading"><div><p className="workspace-kicker">Business setup</p><h1>Your business details.</h1><p>Give your workspace the right name, trade, and local business day.</p></div><Link href="/setup" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold">Back to setup</Link></div>
      <section className="workspace-panel max-w-3xl p-5 sm:p-8" aria-label="Business profile">
        <BusinessProfileForm initial={{ name: organization.name, tradeType: organization.tradeType, timezone: organization.timezone, phone: organization.phone, email: organization.email }} timezones={timezones} writable={isSubscriptionActive(organization) && !organization.readOnlyAt} />
      </section>
    </main>
  )
}
