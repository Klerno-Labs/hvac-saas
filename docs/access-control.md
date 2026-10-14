# FieldClose access controls

Verified locally on 2026-09-26. These controls share the same trade-independent identity model for HVAC, plumbing, electrical, pest control and other configured trades.

## Role and data boundaries

| Operation | Owner | Office admin / legacy member | Dispatcher / CSR | Technician |
|---|---|---|---|---|
| Customer creation, editing, equipment, deletion | Yes | Yes | Yes | No |
| Job creation and dispatch | Yes | Yes | Yes | No |
| Work notes, completion, photos, signatures and parts usage | All organization jobs | All organization jobs | All organization jobs | Assigned jobs only |
| Customer read | Organization | Organization | Organization | Customers with assigned jobs only |
| Calendar / job detail | Organization | Organization | Organization | Assigned jobs only |
| Pricing changes, quote and invoice creation, commercial lists | Yes | Yes | No | No |
| Inventory costs and price book | Yes | Yes | No | No |
| Issued customer-facing quote/invoice and PDF | Organization jobs | Organization jobs | Organization jobs | Assigned jobs only; no draft documents |
| Card collection | Organization jobs | Organization jobs | Organization jobs | Assigned jobs only |
| Organization-wide checklist dismissal | Yes | No | No | No |
| Billing recovery, team administration and portal-token management | Yes | No | No | No |

`lib/mutation-access.ts` obtains the authenticated user and organization membership from the server. Operational writes require both the corresponding capability and an active subscription or unexpired trial. An explicit `readOnlyAt` freeze overrides active billing status. Unknown roles fail closed. Callers cannot submit an organization ID to change their scope.

Billing recovery, exports, customer portal payments and signed webhook reconciliation deliberately retain their independent guards: subscription failure must not prevent an owner from recovering their account or a valid payment from settling.

The historical `member` role retains the pre-existing office-admin capability set. Newly assigned technician accounts must use `technician`; display names never grant job access.

## State and concurrency guarantees added

- Stock usage decrements an organization-scoped row only when enough stock remains, then inserts usage in the same transaction. Concurrent consumers cannot spend the final part twice.
- Recurring generation locks the schedule and compares the scanned due date. Creating the job, advancing the schedule, recording the membership visit, and recording activity commit together. It skips frozen/inactive organizations, deleted customers and paused memberships. Runs are bounded to 500 schedules and retain chronological ordering.
- Monthly/annual recurrence clamps dates to the destination month's final day rather than rolling a January 31 visit into March.
- Membership enrollment validates both customer tenancy and recurring-schedule tenancy/customer association. Foreign membership updates return 404 instead of false success.
- Customer PDF links cannot expose drafts. Staff PDF requests apply the same assignment filter as the job view and return private, uncached responses.
- Job inventory components receive item identifiers, names and stock quantities; supplier costs are not serialized to field client components.

## Verification

- `tests/mutation-access.test.ts`: authentication, tenant derivation, role capabilities, expired/missing trials, inactive/frozen subscriptions, assignment and customer scopes.
- `tests/operational-actions-access.test.ts`: 28 operational entrypoints reject a frozen workspace before accessing business data.
- `tests/page-capability.test.ts`, `tests/document-download-access.test.ts`, `tests/membership-access.test.ts`: page roles, PDF/token boundaries and foreign membership references.
- `tests/operations-integrity.integration.test.ts`: PostgreSQL concurrency with eight stock consumers and eight recurring workers; skip states; actual database PDF lookup grants the assigned issued document and denies unassigned/draft documents.

These tests are regression coverage for the listed boundaries. They do not replace a separate penetration test, production load test, live payment validation or review of external storage access policies.
