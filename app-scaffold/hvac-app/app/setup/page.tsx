import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Check, ArrowUpRight } from 'lucide-react'
import { requireAuth } from '@/lib/session'
import { canDo } from '@/lib/permissions'
import { getActivationReadiness } from '@/lib/activation-readiness'
import { Badge } from '@/components/ui/badge'

export default async function SetupPage() {
  const context = await requireAuth()
  if (!canDo(context.role, 'manageBilling')) redirect('/field')
  const readiness = await getActivationReadiness(context)

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <p className="workspace-kicker">{context.organization.name}</p>
          <h1>Make FieldClose your own.</h1>
          <p>Set up your business, bring in your work, and prepare to get paid.</p>
        </div>
        <Link href="/help/getting-started" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold">Read the setup guide <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>

      <section className="workspace-panel mb-6 p-5 sm:p-6" aria-labelledby="setup-progress">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="workspace-kicker">Your progress</p>
            <h2 id="setup-progress" className="text-xl font-semibold">{readiness.completed} of {readiness.total} steps complete</h2>
            <p className="mt-2 text-sm text-muted-foreground">Progress comes from saved business details and records. Opening a page never marks a step complete. Team setup is optional.</p>
          </div>
          <Link href={readiness.nextAction.href as never} className="button">{readiness.nextAction.label} <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <progress className="mt-5 h-2 w-full accent-primary" value={readiness.completed} max={readiness.total} aria-label="Required setup steps completed" />
      </section>

      <div className="workspace-notice mb-6">
        <div>
          <strong>{readiness.subscriptionLabel}</strong>
          <p>{readiness.writable ? 'Your FieldClose subscription provides app access. Connecting Stripe to receive customer payments is a separate step below.' : 'Review your app subscription to resume creating and changing business records. Your saved setup progress remains here.'}</p>
        </div>
        <Link href="/settings/billing" className="shrink-0 font-semibold underline underline-offset-4">App subscription</Link>
      </div>

      <ol className="space-y-4" aria-label="Business setup steps">
        {readiness.steps.map((step, index) => (
          <li key={step.id} id={step.id} className="workspace-panel p-5 sm:p-6">
            <div className="flex gap-4">
              <span className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${step.complete ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`} aria-label={step.complete ? 'Complete' : 'Incomplete'}>
                {step.complete ? <Check size={17} aria-hidden="true" /> : <span className="text-sm">{index + 1}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold">{step.title}</h2>
                  <Badge variant="outline">{step.status}</Badge>
                  {step.optional && <span className="text-xs text-muted-foreground">Not required for setup</span>}
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{step.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold">
                  <Link href={step.action.href as never} className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline">{step.action.label}<ArrowRight size={15} aria-hidden="true" /></Link>
                  {step.secondary && step.secondary.href !== step.action.href && <Link href={step.secondary.href as never} className="text-muted-foreground underline-offset-4 hover:underline">{step.secondary.label}</Link>}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">This guide remains available under Setup even if you hide the dashboard checklist. <Link href="/help/getting-started" className="underline underline-offset-4">Get help with any step.</Link></p>
    </main>
  )
}
