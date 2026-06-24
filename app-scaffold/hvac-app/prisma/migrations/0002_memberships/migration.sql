-- AlterTable
ALTER TABLE "RecurringJob" ADD COLUMN     "membershipId" TEXT;

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "termMonths" INTEGER NOT NULL DEFAULT 12,
    "visitFrequency" TEXT NOT NULL,
    "includedVisitsPerTerm" INTEGER NOT NULL DEFAULT 1,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipEnrollment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipEquipment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipEnrollmentId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipPlan_organizationId_idx" ON "MembershipPlan"("organizationId");

-- CreateIndex
CREATE INDEX "MembershipEnrollment_organizationId_idx" ON "MembershipEnrollment"("organizationId");

-- CreateIndex
CREATE INDEX "MembershipEnrollment_customerId_idx" ON "MembershipEnrollment"("customerId");

-- CreateIndex
CREATE INDEX "MembershipEnrollment_planId_idx" ON "MembershipEnrollment"("planId");

-- CreateIndex
CREATE INDEX "MembershipEquipment_organizationId_idx" ON "MembershipEquipment"("organizationId");

-- CreateIndex
CREATE INDEX "MembershipEquipment_membershipEnrollmentId_idx" ON "MembershipEquipment"("membershipEnrollmentId");

-- CreateIndex
CREATE INDEX "MembershipEquipment_equipmentId_idx" ON "MembershipEquipment"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipEquipment_membershipEnrollmentId_equipmentId_key" ON "MembershipEquipment"("membershipEnrollmentId", "equipmentId");

-- CreateIndex
CREATE INDEX "RecurringJob_membershipId_idx" ON "RecurringJob"("membershipId");

-- AddForeignKey
ALTER TABLE "RecurringJob" ADD CONSTRAINT "RecurringJob_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "MembershipEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipEnrollment" ADD CONSTRAINT "MembershipEnrollment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipEnrollment" ADD CONSTRAINT "MembershipEnrollment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipEnrollment" ADD CONSTRAINT "MembershipEnrollment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipEquipment" ADD CONSTRAINT "MembershipEquipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipEquipment" ADD CONSTRAINT "MembershipEquipment_membershipEnrollmentId_fkey" FOREIGN KEY ("membershipEnrollmentId") REFERENCES "MembershipEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipEquipment" ADD CONSTRAINT "MembershipEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

