import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEMO_DATES, DEMO_INVOICE_ID, DEMO_STEPS, createDemoEventTracker, demoDateLabel, demoLines, demoMoney, demoReducer, demoStepComplete, demoTotals, initialDemoState, unlockedDemoStep, type DemoAction, type DemoState, type DemoStep } from '@/lib/demo-tour'
import { DemoStage, DemoTour } from '@/app/(marketing)/demo/tour'
import DemoPage from '@/app/(marketing)/demo/page'

const reduce = (...actions: DemoAction[]) => actions.reduce(demoReducer, initialDemoState())
const throughApproval: DemoAction[] = [{ type: 'save-job' }, { type: 'send-estimate' }, { type: 'approve' }]
const throughInvoice: DemoAction[] = [...throughApproval, { type: 'create-invoice' }]
function stageHtml(state: DemoState, approvalChecked = false) {
  return renderToStaticMarkup(React.createElement(DemoStage, { state, dispatch: () => {}, approvalChecked, onApprovalChange: () => {} }))
}

describe('sample tour progression', () => {
  it('requires the preceding work before every subsequent action', () => {
    const initial = initialDemoState()
    for (const action of [{ type: 'next' }, { type: 'visit', step: 4 }, { type: 'send-estimate' }, { type: 'approve' }, { type: 'create-invoice' }, { type: 'confirm-payment' }] as DemoAction[]) {
      expect(demoReducer(initial, action)).toEqual(initial)
    }
    expect(demoReducer(reduce({ type: 'save-job' }), { type: 'approve' }).approved).toBe(false)
    expect(demoReducer(reduce({ type: 'save-job' }, { type: 'send-estimate' }), { type: 'create-invoice' }).invoiceId).toBeNull()
    expect(demoReducer(reduce(...throughApproval), { type: 'confirm-payment' }).paymentConfirmed).toBe(false)
  })

  it('unlocks one step at a time and only marks payment complete after explicit simulation', () => {
    let state = initialDemoState()
    const actions: DemoAction[] = [{ type: 'save-job' }, { type: 'send-estimate' }, { type: 'approve' }, { type: 'create-invoice' }, { type: 'confirm-payment' }]
    actions.forEach((action, index) => {
      expect(demoStepComplete(state, index as DemoStep)).toBe(false)
      state = demoReducer(state, action)
      expect(demoStepComplete(state, index as DemoStep)).toBe(true)
      expect(unlockedDemoStep(state)).toBe(Math.min(index + 1, 4))
      state = demoReducer(state, { type: 'next' })
      expect(state.step).toBe(Math.min(index + 1, 4))
    })
    expect(state.paymentConfirmed).toBe(true)
    expect(demoReducer(state, { type: 'next' }).step).toBe(4)
  })

  it('back and step navigation preserve completed work without permitting skipped stages', () => {
    const state = reduce(...throughInvoice, { type: 'visit', step: 4 }, { type: 'back' })
    expect(state.step).toBe(3)
    expect(state.invoiceId).toBe(DEMO_INVOICE_ID)
    const start = demoReducer(state, { type: 'visit', step: 0 })
    expect(demoReducer(start, { type: 'back' }).step).toBe(0)
    expect(demoReducer(start, { type: 'visit', step: 4 }).invoiceId).toBe(DEMO_INVOICE_ID)
  })

  it('repeated conversion opens the same invoice and preserves the approved total', () => {
    const state = reduce({ type: 'set-filter', included: true }, ...throughInvoice)
    const totalBefore = demoTotals(demoLines(state.includeFilter))
    const reopened = demoReducer(state, { type: 'create-invoice' })
    expect(reopened.invoiceId).toBe(DEMO_INVOICE_ID)
    expect(reopened.announcement).toContain('No second invoice was created')
    expect(demoTotals(demoLines(reopened.includeFilter))).toEqual(totalBefore)
  })

  it('freezes sent scope and date until the visitor explicitly resets', () => {
    const state = reduce({ type: 'set-date', date: DEMO_DATES[1] }, { type: 'set-filter', included: true }, ...throughApproval)
    expect(demoReducer(state, { type: 'set-filter', included: false }).includeFilter).toBe(true)
    expect(demoReducer(state, { type: 'set-date', date: DEMO_DATES[0] }).scheduledDate).toBe(DEMO_DATES[1])
    const reset = demoReducer(state, { type: 'reset' })
    expect(reset).toEqual({ ...initialDemoState(), announcement: 'Tour reset. All sample changes have been cleared.' })
    expect(unlockedDemoStep(reset)).toBe(0)
  })

  it('reset clears an already paid simulation and its linked invoice', () => {
    const state = reduce(...throughInvoice, { type: 'confirm-payment' }, { type: 'reset' })
    expect(state.paymentConfirmed).toBe(false)
    expect(state.invoiceId).toBeNull()
    expect(state.approved).toBe(false)
  })

  it('tracks only one start/completion per intentional tour and never counts a blocked payment as complete', () => {
    const events: string[] = []
    const track = createDemoEventTracker(event => events.push(event))
    let state = initialDemoState()
    const act = (action: DemoAction) => {
      const next = demoReducer(state, action)
      track(state, next, action)
      state = next
    }
    expect(events).toEqual([])
    act({ type: 'confirm-payment' })
    expect(events).toEqual(['demo_started'])
    throughInvoice.forEach(act)
    act({ type: 'confirm-payment' })
    act({ type: 'confirm-payment' })
    act({ type: 'back' })
    expect(events).toEqual(['demo_started', 'demo_completed'])
    act({ type: 'reset' })
    expect(events).toEqual(['demo_started', 'demo_completed'])
    act({ type: 'set-filter', included: true })
    expect(events).toEqual(['demo_started', 'demo_completed', 'demo_started'])
  })
})

describe('sample amounts and calendar date', () => {
  it('calculates whole cents and rounds sample tax once on the subtotal', () => {
    expect(demoTotals(demoLines(false))).toEqual({ subtotalCents: 19000, taxCents: 1568, totalCents: 20568 })
    expect(demoTotals(demoLines(true))).toEqual({ subtotalCents: 21500, taxCents: 1774, totalCents: 23274 })
    expect(demoTotals([{ description: 'Rounding example', quantity: 3, unitPriceCents: 199 }])).toEqual({ subtotalCents: 597, taxCents: 49, totalCents: 646 })
    expect(demoMoney(20568)).toBe('$205.68')
  })

  it('keeps service dates calendar dates without introducing an appointment time', () => {
    expect(demoDateLabel(DEMO_DATES[0])).toBe('October 14, 2026')
    expect(stageHtml(initialDemoState())).toContain('Arrival times are arranged separately')
  })
})

describe('public tour accessibility and truthful rendering', () => {
  it('renders a labelled main region, current step, live status, keyboard buttons and no-JavaScript fallback', () => {
    const html = renderToStaticMarkup(React.createElement(DemoTour, { tradeId: 'hvac' }))
    expect(html).toContain('id="marketing-content" tabindex="-1"')
    expect(html).toContain('aria-label="Product tour steps"')
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
    expect(html).toContain('aria-labelledby="demo-step-title"')
    expect(html).toContain('id="demo-step-title" tabindex="-1"')
    expect(html).toContain('role="status" aria-live="polite" aria-atomic="true"')
    expect(html).toContain('<noscript>')
    expect(html).toContain('Reset tour')
    expect(html).toContain('All actions are simulated')
    expect(html).toContain('for="demo-date"')
    expect(html).toContain('aria-describedby="demo-date-help"')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Next: estimate/)
  })

  it('renders every step without auth, a database, or payment/email clients', () => {
    for (let step = 0; step < DEMO_STEPS.length; step++) {
      const state = { ...reduce(...throughInvoice), step: step as DemoStep }
      expect(stageHtml(state)).toContain('SAMPLE')
    }
  })

  it('requires the labelled simulation consent checkbox before approval', () => {
    const state = { ...reduce({ type: 'save-job' }, { type: 'send-estimate' }), step: 2 as const }
    const unchecked = stageHtml(state)
    expect(unchecked).toContain('id="demo-approval"')
    expect(unchecked).toContain('aria-describedby="demo-approval-help"')
    expect(unchecked).toMatch(/<button[^>]*disabled=""[^>]*>Simulate customer approval/)
    expect(stageHtml(state, true)).not.toMatch(/<button[^>]*disabled=""[^>]*>Simulate customer approval/)
    expect(unchecked).toContain('not a signature or agreement')
  })

  it('labels tabular amounts and retains the exact approved total on the invoice', () => {
    const state = reduce({ type: 'set-filter', included: true }, ...throughInvoice)
    const estimate = stageHtml({ ...state, step: 1 })
    const invoice = stageHtml({ ...state, step: 3 })
    for (const html of [estimate, invoice]) {
      expect(html).toContain('<caption')
      expect(html).toContain('scope="col"')
      expect(html).toContain('scope="row"')
      expect(html).toContain('$232.74')
      expect(html).toContain('Illustrative prices and tax only')
    }
  })

  it('makes the difference between simulation and real payment explicit', () => {
    const before = { ...reduce(...throughInvoice), step: 4 as const }
    expect(stageHtml(before)).toContain('$205.68')
    expect(stageHtml(before)).toContain('verified Stripe confirmation')
    const paid = demoReducer(before, { type: 'confirm-payment' })
    const html = stageHtml(paid)
    expect(html).toContain('$0.00')
    expect(html).toContain('Simulated confirmed payment: $205.68')
    expect(html).toContain('No checkout, card details, charge, or payment is created here')
  })

  it('retains a validated trade in trial links and safely ignores invalid/multiple query values', async () => {
    for (const [trade, expected] of [['electrical', 'electrical'], ['not-a-trade', 'hvac'], [['hvac', 'plumbing'], 'hvac']] as const) {
      const page = await DemoPage({ searchParams: Promise.resolve({ trade: typeof trade === 'string' ? trade : [...trade] }) })
      const html = renderToStaticMarkup(page)
      expect(html).toContain(`href="/signup?trade=${expected}"`)
      expect(html).not.toContain('href="/signup?trade=not-a-trade"')
    }
  })

  it('preserves a selected Pro trial through the tour without trusting arbitrary plan values', async () => {
    const page = await DemoPage({ searchParams: Promise.resolve({ trade: 'electrical', plan: 'pro' }) })
    expect(renderToStaticMarkup(page)).toContain('href="/signup?trade=electrical&amp;plan=pro"')
    for (const plan of ['enterprise', ['starter', 'pro']]) {
      const invalid = await DemoPage({ searchParams: Promise.resolve({ trade: 'electrical', plan }) })
      expect(renderToStaticMarkup(invalid)).toContain('href="/signup?trade=electrical"')
      expect(renderToStaticMarkup(invalid)).not.toContain('&amp;plan=')
    }
  })
})
