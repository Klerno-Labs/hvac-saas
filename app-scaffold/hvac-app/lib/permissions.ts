/**
 * Role-based access control for FieldClose organizations.
 *
 * This module is the single source of truth for the role taxonomy and the
 * role -> capability mapping. It is intentionally pure (no `db`/`auth`
 * imports) so it can be imported from client components as well as server
 * code. The server-side enforcer lives in `lib/require-capability.ts`.
 *
 * Roles (stored on OrganizationMember.role as a lowercase string):
 *   owner        — full control; only role that can manage team, billing,
 *                  integrations, and view the audit log.
 *   office_admin — office staff who can edit pricing/billing documents
 *                  (estimates, invoices) and manage the dispatch board.
 *   dispatcher   — manages the dispatch board (job status, scheduling,
 *                  assignment) and views all jobs.
 *   technician   — field staff; can only see jobs assigned to them and
 *                  record proof of work on those jobs.
 *   csr          — customer service; can view all jobs but cannot edit
 *                  pricing or manage the board.
 */

// --- Roles ---------------------------------------------------------------

export const ROLES = [
  'owner',
  'office_admin',
  'dispatcher',
  'technician',
  'csr',
] as const
export type Role = (typeof ROLES)[number]

export const ROLE_OWNER: Role = 'owner'
export const ROLE_OFFICE_ADMIN: Role = 'office_admin'
export const ROLE_DISPATCHER: Role = 'dispatcher'
export const ROLE_TECHNICIAN: Role = 'technician'
export const ROLE_CSR: Role = 'csr'

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  office_admin: 'Office Admin',
  dispatcher: 'Dispatcher',
  technician: 'Technician',
  csr: 'CSR',
}

/**
 * Legacy role values that pre-date RBAC. They are normalized to their
 * closest equivalent in the new model at read time and migrated in the
 * 0002 migration.
 *
 * `member` was the pre-RBAC default for non-owners and carried the ability
 * to edit estimates/invoices (the old model had no pricing permission
 * check, so any member could edit). It maps to `office_admin`, which
 * preserves that existing ability without granting the owner-only
 * team/billing/integration controls.
 */
export const LEGACY_ROLE_MIGRATIONS: Record<string, Role> = {
  member: 'office_admin',
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/**
 * Normalize a stored role string into a valid Role. Legacy values are
 * mapped via LEGACY_ROLE_MIGRATIONS; unknown/null values fall back to the
 * least-privileged role (`csr`) so a corrupt or missing role never grants
 * more access than intended.
 */
export function normalizeRole(role: string | null | undefined): Role {
  if (isRole(role)) return role
  if (role && role in LEGACY_ROLE_MIGRATIONS) return LEGACY_ROLE_MIGRATIONS[role]
  return ROLE_CSR
}

// --- Capabilities --------------------------------------------------------

export type Capability =
  | 'canManageTeam' // invite / remove / change member roles (owner-only)
  | 'canManageBilling' // subscription + Stripe Connect (owner-only)
  | 'canManageIntegrations' // accounting + collections policy (owner-only)
  | 'canViewAuditLog' // security audit log (owner-only)
  | 'canEditPricing' // estimate/invoice line items, tax, totals
  | 'canManageDispatchBoard' // job status / scheduling / assignment
  | 'canViewAllJobs' // see every org job (technicians see only assigned)
  | 'canEditJobCompletion' // record / update proof of work

const CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set<Capability>([
    'canManageTeam',
    'canManageBilling',
    'canManageIntegrations',
    'canViewAuditLog',
    'canEditPricing',
    'canManageDispatchBoard',
    'canViewAllJobs',
    'canEditJobCompletion',
  ]),
  office_admin: new Set<Capability>([
    'canEditPricing',
    'canManageDispatchBoard',
    'canViewAllJobs',
    'canEditJobCompletion',
  ]),
  dispatcher: new Set<Capability>([
    'canManageDispatchBoard',
    'canViewAllJobs',
    'canEditJobCompletion',
  ]),
  technician: new Set<Capability>(['canEditJobCompletion']),
  csr: new Set<Capability>(['canViewAllJobs']),
}

export function hasCapability(
  role: string | null | undefined,
  capability: Capability,
): boolean {
  return CAPABILITIES[normalizeRole(role)].has(capability)
}

// Named wrappers for readability at call sites.
export const canManageTeam = (role: string | null | undefined) =>
  hasCapability(role, 'canManageTeam')
export const canManageBilling = (role: string | null | undefined) =>
  hasCapability(role, 'canManageBilling')
export const canManageIntegrations = (role: string | null | undefined) =>
  hasCapability(role, 'canManageIntegrations')
export const canViewAuditLog = (role: string | null | undefined) =>
  hasCapability(role, 'canViewAuditLog')
export const canEditPricing = (role: string | null | undefined) =>
  hasCapability(role, 'canEditPricing')
export const canManageDispatchBoard = (role: string | null | undefined) =>
  hasCapability(role, 'canManageDispatchBoard')
export const canViewAllJobs = (role: string | null | undefined) =>
  hasCapability(role, 'canViewAllJobs')
export const canEditJobCompletion = (role: string | null | undefined) =>
  hasCapability(role, 'canEditJobCompletion')

// --- Job scoping ---------------------------------------------------------

/**
 * Returns a Prisma `where` fragment that restricts jobs to what the given
 * role may see. Roles with `canViewAllJobs` get an empty fragment (no extra
 * restriction beyond organizationId); technicians are scoped to jobs
 * assigned to them.
 *
 * Spread/merge this into the caller's org-scoped where clause.
 */
export function jobScopeWhere(
  role: string | null | undefined,
  userId: string,
): Record<string, unknown> {
  if (!canViewAllJobs(role)) {
    return { assignedToUserId: userId }
  }
  return {}
}
