'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-react'
import { DEMO_DATES, DEMO_STEPS, createDemoEventTracker, demoDateLabel, demoLines, demoMoney, demoReducer, demoStepComplete, demoTotals, initialDemoState, unlockedDemoStep, type DemoAction, type DemoDate, type DemoState, type DemoStep } from '@/lib/demo-tour'
import type { TradeId } from '@/lib/trades'
import { trackPublicFunnel } from '@/lib/track-public-funnel'
import styles from './demo.module.css'

const STEP_COPY = [
  { title: 'Give every job a clear starting point.', description: 'A customer, a service date, and the notes your team needs. Save this sample job to begin.' },
  { title: 'Put the scope and price in writing.', description: 'Review the sample line items. Add a filter to see the total update, then preview the customer’s next step.' },
  { title: 'Make the next decision easy.', description: 'Switch to the customer’s view. A clear scope and total help them decide whether to approve the work.' },
  { title: 'Keep the approved work connected.', description: 'Create one linked draft invoice from the accepted estimate, carrying its line items and total forward.' },
  { title: 'Know when the payment is confirmed.', description: 'Finish with a simulated payment confirmation and see the balance reach zero.' },
] as const

export function DemoAmounts({ state, invoice = false }: { state: DemoState; invoice?: boolean }) {
  const lines = demoLines(state.includeFilter)
  const totals = demoTotals(lines)
  return <>
    <table className={styles.lineTable}>
      <caption className={styles.srOnly}>Sample {invoice ? 'invoice' : 'estimate'} line items in US dollars</caption>
      <thead><tr><th scope="col">Service / material</th><th scope="col">Qty</th><th scope="col">Amount</th></tr></thead>
      <tbody>{lines.map(line => <tr key={line.description}><th scope="row">{line.description}</th><td>{line.quantity}</td><td>{demoMoney(line.quantity * line.unitPriceCents)}</td></tr>)}</tbody>
    </table>
    <dl className={styles.totals}>
      <div><dt>Subtotal</dt><dd>{demoMoney(totals.subtotalCents)}</dd></div>
      <div><dt>Sample tax · 8.25%</dt><dd>{demoMoney(totals.taxCents)}</dd></div>
      <div className={styles.total}><dt>Total · USD</dt><dd>{demoMoney(totals.totalCents)}</dd></div>
    </dl>
    <p className={styles.finePrint}>Illustrative prices and tax only. Your business sets its own rates and applicable tax.</p>
  </>
}

/** Exported separately so every stage can be rendered and checked without browser side effects. */
export function DemoStage({ state, dispatch, approvalChecked, onApprovalChange }: {
  state: DemoState
  dispatch: React.Dispatch<Parameters<typeof demoReducer>[1]>
  approvalChecked: boolean
  onApprovalChange: (checked: boolean) => void
}) {
  const total = demoTotals(demoLines(state.includeFilter)).totalCents
  if (state.step === 0) return <>
    <div className={styles.recordHead}><span className={styles.recordId}>SAMPLE JOB · DEMO-JOB-001</span><span className={styles.badge}>{state.jobSaved ? 'Saved in tour' : 'Ready to save'}</span></div>
    <h3 className={styles.recordTitle}>Cooling system repair</h3>
    <dl className={styles.details}>
      <div><dt>Customer</dt><dd>Jamie Rivera <span>Fictional customer</span></dd></div>
      <div><dt>Service address</dt><dd>24 Example Lane <span>Fictional address</span></dd></div>
      <div><dt>Equipment</dt><dd>Outdoor condenser · Unit A</dd></div>
      <div><dt>Job notes</dt><dd>Cooling is weak. Inspect the system and quote the repair before starting work.</dd></div>
    </dl>
    <div className={styles.dateField}>
      <label htmlFor="demo-date">Sample service date</label>
      <select id="demo-date" value={state.scheduledDate} disabled={state.estimateSent} onChange={event => dispatch({ type: 'set-date', date: event.target.value as DemoDate })} aria-describedby="demo-date-help">
        {DEMO_DATES.map(date => <option key={date} value={date}>{demoDateLabel(date)}</option>)}
      </select>
      <p id="demo-date-help" className={styles.finePrint}>Scheduling currently selects a day. Arrival times are arranged separately.</p>
    </div>
    <button className={styles.action} type="button" disabled={state.jobSaved} onClick={() => dispatch({ type: 'save-job' })}>{state.jobSaved ? <><Check size={17} aria-hidden="true" /> Sample job saved</> : 'Save sample job'}</button>
  </>

  if (state.step === 1) return <>
    <div className={styles.recordHead}><span className={styles.recordId}>SAMPLE ESTIMATE · DEMO-EST-001</span><span className={styles.badge}>{state.approved ? 'Accepted in tour' : state.estimateSent ? 'Sent in tour' : 'Draft'}</span></div>
    <h3 className={styles.recordTitle}>Cooling system repair</h3>
    <p className={styles.recordDescription}>For Jamie Rivera · Replace the run capacitor after diagnosis, then check system operation.</p>
    <label className={styles.checkbox}><input type="checkbox" checked={state.includeFilter} disabled={state.estimateSent} onChange={event => dispatch({ type: 'set-filter', included: event.target.checked })} /><span>Add a replacement return-air filter <strong>+$25.00 before sample tax</strong></span></label>
    <DemoAmounts state={state} />
    {state.estimateSent && <p className={styles.finePrint}>This sample estimate is already sent. Reset the tour to change its line items.</p>}
    <button className={styles.action} type="button" disabled={state.estimateSent} onClick={() => dispatch({ type: 'send-estimate' })}>{state.estimateSent ? <><Check size={17} aria-hidden="true" /> Sample estimate sent</> : 'Simulate sending estimate'}</button>
    <p className={styles.finePrint}>In your workspace, you review prices before sending. This demo sends no email.</p>
  </>

  if (state.step === 2) return <>
    <div className={styles.recordHead}><span className={styles.recordId}>CUSTOMER VIEW · SAMPLE PREVIEW</span><span className={styles.badge}>{state.approved ? 'Accepted in tour' : 'Awaiting sample approval'}</span></div>
    <h3 className={styles.recordTitle}>Your estimate is ready.</h3>
    <p className={styles.recordDescription}>Jamie, review the scope and total for your cooling system repair.</p>
    <DemoAmounts state={state} />
    {state.approved ? <p className={styles.success}><CheckCircle2 size={20} aria-hidden="true" /> Sample approval recorded for Jamie Rivera.</p> : <>
      <label className={styles.checkbox}><input id="demo-approval" type="checkbox" checked={approvalChecked} onChange={event => onApprovalChange(event.target.checked)} aria-describedby="demo-approval-help" /><span>I’m ready to simulate approval of this sample estimate.</span></label>
      <button className={styles.action} type="button" disabled={!approvalChecked} onClick={() => dispatch({ type: 'approve' })}>Simulate customer approval</button>
    </>}
    <p id="demo-approval-help" className={styles.finePrint}>This is a fictional approval, not a signature or agreement. Real customers review and approve their own estimates in the customer portal.</p>
  </>

  if (state.step === 3) return <>
    <div className={styles.recordHead}><span className={styles.recordId}>{state.invoiceId ? `SAMPLE INVOICE · ${state.invoiceId}` : 'ACCEPTED SAMPLE ESTIMATE · DEMO-EST-001'}</span><span className={styles.badge}>{state.paymentConfirmed ? 'Paid in simulation' : state.invoiceId ? 'Draft invoice' : 'Ready to convert'}</span></div>
    <h3 className={styles.recordTitle}>{state.invoiceId ? 'Same work. Ready to invoice.' : 'Turn approval into an invoice.'}</h3>
    <p className={styles.recordDescription}>Jamie Rivera · Cooling system repair<br />Linked to sample estimate DEMO-EST-001.</p>
    <DemoAmounts state={state} invoice={Boolean(state.invoiceId)} />
    <button className={styles.action} type="button" onClick={() => dispatch({ type: 'create-invoice' })}>{state.invoiceId ? 'Open the linked sample invoice again' : 'Create sample invoice'}</button>
    <p className={styles.finePrint}>{state.invoiceId ? 'Try it again: the same invoice opens. A second invoice is not created.' : 'The actual app creates a linked draft for your review before sending.'}</p>
  </>

  return <>
    <div className={styles.recordHead}><span className={styles.recordId}>SAMPLE PAYMENT · {state.invoiceId}</span><span className={styles.badge}>{state.paymentConfirmed ? 'Paid in simulation' : 'Unpaid sample'}</span></div>
    <div className={styles.paymentCard}>
      {state.paymentConfirmed ? <CheckCircle2 className={styles.paymentIcon} size={44} aria-hidden="true" /> : <ShieldCheck className={styles.paymentIcon} size={44} aria-hidden="true" />}
      <h3 className={styles.recordTitle}>{state.paymentConfirmed ? 'That’s the full workflow.' : 'One clear outstanding balance.'}</h3>
      <p>Sample balance due</p><p className={styles.balance}>{demoMoney(state.paymentConfirmed ? 0 : total)}</p>
      {state.paymentConfirmed && <p className={styles.success}>Simulated confirmed payment: {demoMoney(total)}</p>}
    </div>
    <div className={styles.explainer}><strong>What happens in your workspace</strong><p>You review and send the invoice. The customer pays through Stripe, and FieldClose marks it paid after a verified Stripe confirmation.</p></div>
    <button className={styles.action} type="button" disabled={state.paymentConfirmed} onClick={() => dispatch({ type: 'confirm-payment' })}>{state.paymentConfirmed ? <><Check size={17} aria-hidden="true" /> Simulation complete</> : 'Simulate payment confirmation'}</button>
    <p className={styles.finePrint}>No checkout, card details, charge, or payment is created here. This button only changes the sample.</p>
  </>
}

export function DemoTour({ tradeId, plan }: { tradeId: TradeId; plan?: 'starter' | 'pro' }) {
  const [state, rawDispatch] = useReducer(demoReducer, undefined, initialDemoState)
  const eventTracker = useRef(createDemoEventTracker(trackPublicFunnel))
  const dispatch = (action: DemoAction) => {
    eventTracker.current(state, demoReducer(state, action), action)
    rawDispatch(action)
  }
  const [approvalChecked, setApprovalChecked] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const previousStep = useRef(state.step)
  useEffect(() => {
    if (previousStep.current !== state.step) heading.current?.focus()
    previousStep.current = state.step
  }, [state.step])
  const signupQuery = new URLSearchParams({ trade: tradeId })
  if (plan) signupQuery.set('plan', plan)
  const signupHref = `/signup?${signupQuery.toString()}`
  const total = demoTotals(demoLines(state.includeFilter)).totalCents
  const copy = STEP_COPY[state.step]
  const reset = () => { setApprovalChecked(false); dispatch({ type: 'reset' }) }

  return <main id="marketing-content" tabIndex={-1} className={styles.demo}>
    <div className={styles.container}>
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>THE FIELDCLOSE PRODUCT TOUR</p><h1 className={styles.heroTitle}>Take a job<br />all the way to paid.</h1></div>
        <div className={styles.heroAside}><p>Try the everyday workflow with a fictional HVAC service visit. No account required.</p><a className={styles.signup} href={signupHref}>Start your free trial <ArrowRight size={18} aria-hidden="true" /></a><p className={styles.finePrint}>14 days · No credit card required</p></div>
      </header>

      <div className={styles.demoNotice}><span className={styles.liveDot} aria-hidden="true" /><strong>Interactive sample</strong><span>All actions are simulated. Nothing is emailed, saved to an account, or charged.</span></div>
      <noscript><p className={styles.noScript}>Enable JavaScript to move through the interactive tour. You can also <a href="/faq">read the product FAQ</a> or <a href={signupHref}>start a free trial</a>.</p></noscript>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <p className={styles.sidebarLabel}>One connected workflow</p>
          <nav aria-label="Product tour steps"><ol className={styles.steps}>
            {DEMO_STEPS.map((label, index) => {
              const step = index as DemoStep
              const complete = demoStepComplete(state, step)
              return <li key={label}><button type="button" className={state.step === step ? styles.currentStep : styles.stepButton} aria-current={state.step === step ? 'step' : undefined} aria-controls="demo-panel" disabled={step > unlockedDemoStep(state)} onClick={() => dispatch({ type: 'visit', step })}><span className={styles.stepNumber} aria-hidden="true">{complete ? <Check size={16} /> : `0${step + 1}`}</span><span>{label}{complete && <span className={styles.srOnly}> — completed in sample</span>}</span></button></li>
            })}
          </ol></nav>
          <div className={styles.sidebarSummary}><span>Fictional HVAC visit</span><strong>{demoMoney(total)}</strong><span>Sample total · USD</span></div>
          <button className={styles.reset} type="button" onClick={reset}><RotateCcw size={15} aria-hidden="true" /> Reset tour</button>
        </aside>

        <section className={styles.stage} id="demo-panel" aria-labelledby="demo-step-title">
          <div className={styles.stageHeading}><p className={styles.eyebrow}>STEP {state.step + 1} OF {DEMO_STEPS.length} · {DEMO_STEPS[state.step].toUpperCase()}</p><h2 id="demo-step-title" ref={heading} tabIndex={-1}>{copy.title}</h2><p>{copy.description}</p></div>
          <div className={styles.record}><DemoStage state={state} dispatch={dispatch} approvalChecked={approvalChecked} onApprovalChange={setApprovalChecked} /></div>
          <div className={styles.tourControls}><button type="button" className={styles.back} disabled={state.step === 0} onClick={() => dispatch({ type: 'back' })}><ArrowLeft size={17} aria-hidden="true" /> Back</button>
            {state.step < 4 ? <button type="button" className={styles.next} disabled={!demoStepComplete(state, state.step)} onClick={() => dispatch({ type: 'next' })}>Next: {DEMO_STEPS[state.step + 1].toLowerCase()} <ArrowRight size={17} aria-hidden="true" /></button> : state.paymentConfirmed ? <a className={styles.next} href={signupHref}>Start with your own business <ArrowRight size={17} aria-hidden="true" /></a> : <span className={styles.controlHint}>Simulate confirmation to finish.</span>}
          </div>
          {state.step < 4 && !demoStepComplete(state, state.step) && <p className={styles.controlHint}>Complete the sample action above to unlock the next step.</p>}
        </section>
      </div>
      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{state.announcement}</p>
      <section className={styles.takeaway} aria-labelledby="demo-takeaway"><div><p className={styles.eyebrow}>LESS HANDOFF. MORE FOLLOW-THROUGH.</p><h2 id="demo-takeaway">Your work has a next step.<br />Keep it moving.</h2></div><div><p>This tour uses sample records and sample prices. Your workspace starts with your business, your customers, and your own pricing.</p><a className={styles.textLink} href={signupHref}>Start your free trial <ArrowRight size={17} aria-hidden="true" /></a></div></section>
    </div>
  </main>
}
