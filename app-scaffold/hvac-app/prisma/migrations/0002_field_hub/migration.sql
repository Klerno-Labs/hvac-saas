-- Field hub: technician assignment, mobile field status, technician notes, asset kind.
--
-- Adds:
--   Job.technicianUserId  (FK -> User) nullable, for RBAC "technicians see only their assigned jobs"
--   Job.fieldStatus       pending|en_route|on_site|done  (separate from back-office Job.status)
--   Job.technicianNotes   technician-entered notes (separate from dispatcher Job.notes)
--   ProofOfWorkAsset.kind general|before|after  (defaults to 'general', backward compatible)

ALTER TABLE "Job" ADD COLUMN "technicianUserId" TEXT;
ALTER TABLE "Job" ADD COLUMN "fieldStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Job" ADD COLUMN "technicianNotes" TEXT;

ALTER TABLE "ProofOfWorkAsset" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'general';

ALTER TABLE "Job" ADD CONSTRAINT "Job_technicianUserId_fkey"
  FOREIGN KEY ("technicianUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Job_technicianUserId_idx" ON "Job"("technicianUserId");
CREATE INDEX "Job_organizationId_technicianUserId_fieldStatus_idx" ON "Job"("organizationId", "technicianUserId", "fieldStatus");
