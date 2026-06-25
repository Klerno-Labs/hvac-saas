export const VALID_ROLES = [
  'owner',
  'office_admin',
  'dispatcher',
  'technician',
  'csr',
] as const

export type OrgRole = (typeof VALID_ROLES)[number]

export type Capability =
  | 'editPricing'    // create/edit estimates and line-item pricing
  | 'manageBilling'  // Stripe, subscriptions, billing settings
  | 'manageTeam'     // invite/remove org members
  | 'viewAllJobs'    // full job board (technicians are filtered to assigned jobs only)
  | 'manageJobs'     // create and dispatch jobs

// 'member' kept for backward-compat with rows created before role expansion.
const CAPABILITIES: Record<string, Set<Capability>> = {
  owner:        new Set(['editPricing', 'manageBilling', 'manageTeam', 'viewAllJobs', 'manageJobs']),
  office_admin: new Set(['editPricing', 'viewAllJobs', 'manageJobs']),
  dispatcher:   new Set(['viewAllJobs', 'manageJobs']),
  technician:   new Set([]),
  csr:          new Set(['viewAllJobs', 'manageJobs']),
  member:       new Set(['editPricing', 'viewAllJobs', 'manageJobs']),
}

export function canDo(role: string, capability: Capability): boolean {
  return CAPABILITIES[role]?.has(capability) ?? false
}
