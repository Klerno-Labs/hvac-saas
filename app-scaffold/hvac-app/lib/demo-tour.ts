/** Fictional, browser-only tour data. Never used to create operational records. */
export const DEMO_STEPS = ['Job', 'Estimate', 'Approval', 'Invoice', 'Payment'] as const
export type DemoStep = 0 | 1 | 2 | 3 | 4
export const DEMO_DATES = ['2026-10-14', '2026-10-15'] as const
export type DemoDate = (typeof DEMO_DATES)[number]
export const DEMO_INVOICE_ID = 'DEMO-INV-001'
export const DEMO_TAX_BASIS_POINTS = 825

export type DemoLine = { description: string; quantity: number; unitPriceCents: number }
export type DemoState = {
  step: DemoStep
  scheduledDate: DemoDate
  includeFilter: boolean
  jobSaved: boolean
  estimateSent: boolean
  approved: boolean
  invoiceId: string | null
  paymentConfirmed: boolean
  announcement: string
}

export function initialDemoState(): DemoState {
  return { step: 0, scheduledDate: DEMO_DATES[0], includeFilter: false, jobSaved: false, estimateSent: false, approved: false, invoiceId: null, paymentConfirmed: false, announcement: '' }
}

export function demoLines(includeFilter: boolean): DemoLine[] {
  return [
    { description: 'Diagnosis, repair labor & system check', quantity: 1, unitPriceCents: 14500 },
    { description: 'Replacement run capacitor', quantity: 1, unitPriceCents: 4500 },
    ...(includeFilter ? [{ description: 'Replacement return-air filter', quantity: 1, unitPriceCents: 2500 }] : []),
  ]
}

export function demoTotals(lines: readonly DemoLine[]) {
  const subtotalCents = lines.reduce((total, line) => total + line.quantity * line.unitPriceCents, 0)
  const taxCents = Math.round(subtotalCents * DEMO_TAX_BASIS_POINTS / 10000)
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents }
}

export function demoMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function demoDateLabel(date: DemoDate) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

export function unlockedDemoStep(state: DemoState): DemoStep {
  return state.invoiceId ? 4 : state.approved ? 3 : state.estimateSent ? 2 : state.jobSaved ? 1 : 0
}

export function demoStepComplete(state: DemoState, step: DemoStep): boolean {
  return [state.jobSaved, state.estimateSent, state.approved, Boolean(state.invoiceId), state.paymentConfirmed][step]
}

export type DemoAction =
  | { type: 'visit'; step: DemoStep }
  | { type: 'back' | 'next' | 'reset' | 'save-job' | 'send-estimate' | 'approve' | 'create-invoice' | 'confirm-payment' }
  | { type: 'set-date'; date: DemoDate }
  | { type: 'set-filter'; included: boolean }

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'visit':
      return action.step >= 0 && action.step <= unlockedDemoStep(state) ? { ...state, step: action.step } : state
    case 'back':
      return { ...state, step: Math.max(0, state.step - 1) as DemoStep }
    case 'next':
      return state.step < unlockedDemoStep(state) ? { ...state, step: (state.step + 1) as DemoStep } : state
    case 'reset':
      return { ...initialDemoState(), announcement: 'Tour reset. All sample changes have been cleared.' }
    case 'set-date':
      return !state.estimateSent && DEMO_DATES.includes(action.date) ? { ...state, scheduledDate: action.date } : state
    case 'set-filter':
      return !state.estimateSent ? { ...state, includeFilter: action.included } : state
    case 'save-job':
      return { ...state, jobSaved: true, announcement: 'Sample job saved in this tour. Continue to the estimate.' }
    case 'send-estimate':
      return state.jobSaved ? { ...state, estimateSent: true, announcement: 'Sample estimate marked sent. No email was sent. Continue to customer approval.' } : state
    case 'approve':
      return state.estimateSent ? { ...state, approved: true, announcement: 'Sample customer approval recorded in this tour. Continue to the invoice.' } : state
    case 'create-invoice':
      if (!state.approved) return state
      return { ...state, invoiceId: state.invoiceId || DEMO_INVOICE_ID, announcement: state.invoiceId ? `Opened the same sample invoice, ${DEMO_INVOICE_ID}. No second invoice was created.` : `Created sample draft invoice ${DEMO_INVOICE_ID}. Its lines and total match the approved estimate.` }
    case 'confirm-payment':
      return state.invoiceId ? { ...state, paymentConfirmed: true, announcement: 'Payment confirmation simulated. No money was collected. Your sample workflow is complete.' } : state
  }
}

/** One pair of anonymous funnel events per intentional tour, including after reset. */
export function createDemoEventTracker(emit: (event: 'demo_started' | 'demo_completed') => void) {
  let started = false
  let completed = false
  return (before: DemoState, after: DemoState, action: DemoAction) => {
    if (action.type === 'reset') { started = false; completed = false; return }
    if (!started) { started = true; emit('demo_started') }
    if (!completed && !before.paymentConfirmed && after.paymentConfirmed) {
      completed = true
      emit('demo_completed')
    }
  }
}
