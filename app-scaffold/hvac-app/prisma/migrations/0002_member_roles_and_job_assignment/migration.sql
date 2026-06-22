-- Migration 0002: Role-based access control + technician job assignment
--
-- This migration supports the new OrganizationMember role taxonomy
-- (owner | office_admin | dispatcher | technician | csr) introduced in
-- lib/permissions.ts, and adds the Job.assignedToUserId column that backs
-- technician job scoping ("technicians see only their assigned jobs").
--
-- NOTE: OrganizationMember.role and TeamInvite.role are plain TEXT columns
-- (not Postgres enums), so no enum type change is required here — only a
-- data backfill of the legacy `member` value and a new nullable column.
--
-- Review carefully before applying to production: back up the Job and
-- OrganizationMember tables first.

-- 1. Backfill legacy `member` role.
--    The pre-RBAC model had no pricing permission check, so `member` could
--    already edit estimates/invoices. `office_admin` preserves that ability
--    without granting owner-only team/billing/integration controls, so it is
--    not a privilege escalation. Owners are unaffected.
UPDATE "OrganizationMember" SET role = 'office_admin' WHERE role = 'member';
UPDATE "TeamInvite" SET role = 'office_admin' WHERE role = 'member';

-- 2. Job assignment (technician dispatch scoping).
--    Nullable: existing jobs remain unassigned until a dispatcher assigns them.
--    ON DELETE SET NULL so deleting a user does not cascade-delete their jobs.
ALTER TABLE "Job" ADD COLUMN "assignedToUserId" TEXT;

ALTER TABLE "Job" ADD CONSTRAINT "Job_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Job_assignedToUserId_idx" ON "Job"("assignedToUserId");
