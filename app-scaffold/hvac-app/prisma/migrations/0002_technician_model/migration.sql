-- CreateTable
CREATE TABLE "Technician" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'technician',
    "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Technician_pkey" PRIMARY KEY ("id")
);

-- AlterTable
-- Add a nullable technicianId FK to Job. The legacy free-text technicianName
-- column is intentionally retained as a fallback for historical data and for
-- the proof-of-work flow; application code prefers the technician relation.
ALTER TABLE "Job" ADD COLUMN "technicianId" TEXT;

-- Data backfill: create one Technician row per distinct, non-empty
-- Job.technicianName within each organization, then link those existing jobs
-- to the backfilled technician via technicianId. technicianName is left in
-- place on Job as a free-text fallback.
INSERT INTO "Technician" ("id", "organizationId", "name", "role", "skills", "active", "createdAt", "updatedAt")
SELECT
    'backfill_' || row_number() OVER ()::text,
    "organizationId",
    "technicianName",
    'technician',
    ARRAY[]::TEXT[],
    true,
    NOW(),
    NOW()
FROM (
    SELECT DISTINCT "organizationId", "technicianName"
    FROM "Job"
    WHERE "technicianName" IS NOT NULL AND btrim("technicianName") <> ''
) AS distinct_techs;

UPDATE "Job" j
SET "technicianId" = t."id"
FROM "Technician" t
WHERE t."organizationId" = j."organizationId"
  AND t."name" = j."technicianName"
  AND j."technicianName" IS NOT NULL
  AND btrim(j."technicianName") <> '';

-- CreateIndex
CREATE INDEX "Technician_organizationId_idx" ON "Technician"("organizationId");

-- CreateIndex
CREATE INDEX "Technician_organizationId_active_idx" ON "Technician"("organizationId", "active");

-- CreateIndex
CREATE INDEX "Technician_userId_idx" ON "Technician"("userId");

-- CreateIndex
CREATE INDEX "Job_technicianId_idx" ON "Job"("technicianId");

-- AddForeignKey
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
