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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Technician_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Technician_organizationId_idx" ON "Technician"("organizationId");
CREATE INDEX "Technician_userId_idx" ON "Technician"("userId");

-- AddForeignKey (Technician → Organization)
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (Technician → User, optional)
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add technicianId FK to Job
ALTER TABLE "Job" ADD COLUMN "technicianId" TEXT;

-- Backfill: one Technician row per distinct (organizationId, technicianName) pair
INSERT INTO "Technician" ("id", "organizationId", "name", "role", "skills", "active", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::TEXT,
    "organizationId",
    "technicianName",
    'technician',
    ARRAY[]::TEXT[],
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "organizationId", "technicianName"
    FROM "Job"
    WHERE "technicianName" IS NOT NULL AND "technicianName" <> ''
) AS distinct_techs;

-- Link existing jobs to their backfilled Technician rows
UPDATE "Job" AS j
SET "technicianId" = t."id"
FROM "Technician" AS t
WHERE j."organizationId" = t."organizationId"
  AND j."technicianName" = t."name"
  AND j."technicianName" IS NOT NULL
  AND j."technicianName" <> '';

-- AddForeignKey (Job → Technician, nullable, SET NULL on delete)
ALTER TABLE "Job" ADD CONSTRAINT "Job_technicianId_fkey"
    FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Job_technicianId_idx" ON "Job"("technicianId");
