/** Shared product vocabulary. New trades reuse the same customer-to-payment workflow. */
export const TRADE_IDS = ['hvac', 'plumbing', 'electrical', 'pest-control', 'general-service'] as const
export type TradeId = (typeof TRADE_IDS)[number]

export type TradeProfile = {
  id: TradeId
  name: string
  businessLabel: string
  description: string
  jobExamples: readonly string[]
  estimateContext: string
}

export const TRADE_PROFILES: Record<TradeId, TradeProfile> = {
  hvac: {
    id: 'hvac',
    name: 'HVAC',
    businessLabel: 'Heating & cooling',
    description: 'Service, repair, and installation for heating and cooling systems.',
    jobExamples: ['Seasonal system inspection', 'Cooling system repair', 'Equipment replacement'],
    estimateContext: 'Heating, ventilation, and air conditioning service. Include equipment or system details only when supplied in the job notes.',
  },
  plumbing: {
    id: 'plumbing',
    name: 'Plumbing',
    businessLabel: 'Plumbing',
    description: 'Repairs, installations, and maintenance for plumbing systems.',
    jobExamples: ['Leak inspection and repair', 'Water heater replacement', 'Drain service'],
    estimateContext: 'Plumbing service. Include fixture, piping, or water heater details only when supplied in the job notes.',
  },
  electrical: {
    id: 'electrical',
    name: 'Electrical',
    businessLabel: 'Electrical',
    description: 'Electrical service, repairs, and installation work.',
    jobExamples: ['Electrical troubleshooting', 'Lighting installation', 'EV charger installation'],
    estimateContext: 'Electrical service. Include circuit, panel, or load details only when supplied in the job notes. Do not assert code compliance or permit status.',
  },
  'pest-control': {
    id: 'pest-control',
    name: 'Pest control',
    businessLabel: 'Pest control',
    description: 'Property inspections, treatments, and recurring pest services.',
    jobExamples: ['Property pest inspection', 'Scheduled pest service', 'Rodent exclusion review'],
    estimateContext: 'Pest control service. Do not invent pesticide selections, concentrations, safety claims, treatment guarantees, or regulatory approvals.',
  },
  'general-service': {
    id: 'general-service',
    name: 'General service',
    businessLabel: 'Field service',
    description: 'A flexible workflow for other service and maintenance businesses.',
    jobExamples: ['Service visit', 'Repair assessment', 'Scheduled maintenance'],
    estimateContext: 'General field service. Use the job title and notes to identify the work; do not assume a particular trade.',
  },
}

export function isTradeId(value: unknown): value is TradeId {
  return typeof value === 'string' && TRADE_IDS.some((id) => id === value)
}

export function getTradeProfile(value?: string | null): TradeProfile {
  // Existing organizations default to HVAC. Preserve unknown legacy trades as
  // generic service vocabulary until their owner explicitly chooses a profile.
  if (value == null || value === '') return TRADE_PROFILES.hvac
  return TRADE_PROFILES[isTradeId(value) ? value : 'general-service']
}
