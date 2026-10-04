import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import type { ActivationReadiness } from '@/lib/activation-readiness'
import { dismissOnboarding } from '@/app/dashboard/dismiss-onboarding-action'

export function GettingStartedChecklist({ readiness }: { readiness: ActivationReadiness }) {
  if (readiness.completed === readiness.total) return null
  return (
    <section className="workspace-panel mb-6 p-5 sm:p-6" aria-labelledby="getting-started-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="workspace-kicker">Set up your workspace</p>
          <h2 id="getting-started-title" className="text-xl font-semibold">Your next step, in one place.</h2>
          <p className="mt-2 text-sm text-muted-foreground">{readiness.completed} of {readiness.total} steps complete · based on your saved business records.</p>
        </div>
        <form action={dismissOnboarding}>
          <button type="submit" className="cursor-pointer text-xs text-muted-foreground underline underline-offset-4">Hide from dashboard</button>
        </form>
      </div>
      <progress value={readiness.completed} max={readiness.total} className="my-5 h-2 w-full accent-primary" aria-label="Setup steps completed" />
      <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {readiness.steps.filter(step => !step.optional).map(step => (
          <li key={step.id}>
            <Link href={`/setup#${step.id}` as never} className="flex items-center gap-3 rounded-md py-1 text-sm underline-offset-4 hover:underline">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${step.complete ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`} aria-label={step.complete ? 'Complete' : 'Incomplete'}>{step.complete && <Check size={13} aria-hidden="true" />}</span>
              {step.title}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-5">
        <Link href={readiness.nextAction.href as never} className="button">{readiness.nextAction.label}<ArrowRight size={16} aria-hidden="true" /></Link>
        <Link href="/setup" className="text-sm font-semibold underline underline-offset-4">View full setup guide</Link>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">You can always return to Setup after hiding this checklist.</p>
    </section>
  )
}
