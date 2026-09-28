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
  | 'manageCustomers' // create/edit customer records and equipment
  | 'manageInventory' // maintain stock levels and purchase/sale prices
  | 'fieldWork'       // update assigned work, photos, signatures and notes
  | 'manageJobs'     // create and dispatch jobs

// 'member' kept for backward-compat with rows created before role expansion.
const CAPABILITIES: Record<string, Set<Capability>> = {
  owner:        new Set(['editPricing', 'manageBilling', 'manageTeam', 'viewAllJobs', 'manageJobs', 'manageCustomers', 'manageInventory', 'fieldWork']),
  office_admin: new Set(['editPricing', 'viewAllJobs', 'manageJobs', 'manageCustomers', 'manageInventory', 'fieldWork']),
  dispatcher:   new Set(['viewAllJobs', 'manageJobs', 'manageCustomers', 'fieldWork']),
  technician:   new Set(['fieldWork']),
  csr:          new Set(['viewAllJobs', 'manageJobs', 'manageCustomers', 'fieldWork']),
  member:       new Set(['editPricing', 'viewAllJobs', 'manageJobs', 'manageCustomers', 'manageInventory', 'fieldWork']),
}

export function canDo(role: string, capability: Capability): boolean {
  return CAPABILITIES[role]?.has(capability) ?? false
}
