BEGIN;

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE');

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "decisionByIp" TEXT,
ADD COLUMN     "decisionByName" TEXT,
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "declinedAt" TIMESTAMP(3),
ADD COLUMN     "signatureDataUrl" TEXT,
ADD COLUMN     "viewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "completionNoticeChannels" TEXT,
ADD COLUMN     "completionNoticeSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization"
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "jobCompletionNoticeEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'STARTER',
ADD COLUMN     "readOnlyAt" TIMESTAMP(3),
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referralCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referredByOrgId" TEXT,
ADD COLUMN     "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- Preserve legacy billing state instead of resetting paying customers to trial.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Organization" WHERE lower("subscriptionPlan") NOT IN ('free', 'starter', 'pro')
    OR lower("subscriptionStatus") NOT IN ('trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')
    OR ("subscriptionStripeId" IS NOT NULL AND "subscriptionStripeId" NOT LIKE 'cus_%' AND "subscriptionStripeId" NOT LIKE 'sub_%')) THEN
    RAISE EXCEPTION 'Unrecognized legacy billing state; reconcile before migration';
  END IF;
END $$;
UPDATE "Organization" SET
  "plan" = upper("subscriptionPlan")::"Plan",
  "stripeCustomerId" = CASE WHEN "subscriptionStripeId" LIKE 'cus_%' THEN "subscriptionStripeId" ELSE NULL END,
  "stripeSubscriptionId" = CASE WHEN "subscriptionStripeId" LIKE 'sub_%' THEN "subscriptionStripeId" ELSE NULL END;
ALTER TABLE "Organization" ALTER COLUMN "subscriptionStatus" DROP DEFAULT;
ALTER TABLE "Organization" ALTER COLUMN "subscriptionStatus" TYPE "SubscriptionStatus"
  USING (CASE WHEN lower("subscriptionStatus") IN ('incomplete_expired','paused') THEN 'INCOMPLETE' ELSE upper("subscriptionStatus") END)::"SubscriptionStatus";
ALTER TABLE "Organization" ALTER COLUMN "subscriptionStatus" SET DEFAULT 'TRIALING';
ALTER TABLE "Organization" DROP COLUMN "subscriptionPlan", DROP COLUMN "subscriptionStripeId";

-- CreateTable
CREATE TABLE "PlanLimit" (
    "id" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "maxUsers" INTEGER NOT NULL,
    "maxJobsPerMonth" INTEGER NOT NULL,
    "maxActiveCustomers" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "orgId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" TEXT NOT NULL,
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "lastGeneratedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "recurringJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "visitsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "token" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "sellPriceCents" INTEGER NOT NULL DEFAULT 0,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serial" TEXT,
    "installDate" TIMESTAMP(3),
    "installedByUs" BOOLEAN NOT NULL DEFAULT false,
    "installerName" TEXT,
    "tonnage" DOUBLE PRECISION,
    "seer" DOUBLE PRECISION,
    "refrigerantType" TEXT,
    "btu" INTEGER,
    "locationOnProperty" TEXT,
    "warrantyStartDate" TIMESTAMP(3),
    "partsWarrantyMonths" INTEGER,
    "laborWarrantyMonths" INTEGER,
    "lastServicedAt" TIMESTAMP(3),
    "nextServiceDueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "flatPriceCents" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER,
    "imageUrl" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBookItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentServiceRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "jobId" TEXT,
    "serviceType" TEXT NOT NULL,
    "description" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanLimit_plan_key" ON "PlanLimit"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_stripeEventId_key" ON "WebhookEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_nextRetryAt_idx" ON "WebhookEvent"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_updatedAt_idx" ON "WebhookEvent"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "RecurringJob_organizationId_idx" ON "RecurringJob"("organizationId");

-- CreateIndex
CREATE INDEX "RecurringJob_customerId_idx" ON "RecurringJob"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_recurringJobId_key" ON "Membership"("recurringJobId");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");

-- CreateIndex
CREATE INDEX "Membership_customerId_idx" ON "Membership"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReview_jobId_key" ON "CustomerReview"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReview_token_key" ON "CustomerReview"("token");

-- CreateIndex
CREATE INDEX "CustomerReview_organizationId_idx" ON "CustomerReview"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerReview_token_idx" ON "CustomerReview"("token");

-- CreateIndex
CREATE INDEX "InventoryItem_organizationId_idx" ON "InventoryItem"("organizationId");

-- CreateIndex
CREATE INDEX "InventoryItem_organizationId_sku_idx" ON "InventoryItem"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "InventoryUsage_organizationId_idx" ON "InventoryUsage"("organizationId");

-- CreateIndex
CREATE INDEX "InventoryUsage_jobId_idx" ON "InventoryUsage"("jobId");

-- CreateIndex
CREATE INDEX "InventoryUsage_inventoryItemId_idx" ON "InventoryUsage"("inventoryItemId");

-- CreateIndex
CREATE INDEX "Equipment_organizationId_idx" ON "Equipment"("organizationId");

-- CreateIndex
CREATE INDEX "Equipment_customerId_idx" ON "Equipment"("customerId");

-- CreateIndex
CREATE INDEX "PriceBookItem_organizationId_idx" ON "PriceBookItem"("organizationId");

-- CreateIndex
CREATE INDEX "EquipmentServiceRecord_organizationId_idx" ON "EquipmentServiceRecord"("organizationId");

-- CreateIndex
CREATE INDEX "EquipmentServiceRecord_equipmentId_idx" ON "EquipmentServiceRecord"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentServiceRecord_jobId_idx" ON "EquipmentServiceRecord"("jobId");

-- CreateIndex
CREATE INDEX "JobSignature_organizationId_idx" ON "JobSignature"("organizationId");

-- CreateIndex
CREATE INDEX "JobSignature_jobId_idx" ON "JobSignature"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_referralCode_key" ON "Organization"("referralCode");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_referredByOrgId_fkey" FOREIGN KEY ("referredByOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJob" ADD CONSTRAINT "RecurringJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJob" ADD CONSTRAINT "RecurringJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_recurringJobId_fkey" FOREIGN KEY ("recurringJobId") REFERENCES "RecurringJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReview" ADD CONSTRAINT "CustomerReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReview" ADD CONSTRAINT "CustomerReview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReview" ADD CONSTRAINT "CustomerReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUsage" ADD CONSTRAINT "InventoryUsage_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUsage" ADD CONSTRAINT "InventoryUsage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUsage" ADD CONSTRAINT "InventoryUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookItem" ADD CONSTRAINT "PriceBookItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentServiceRecord" ADD CONSTRAINT "EquipmentServiceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentServiceRecord" ADD CONSTRAINT "EquipmentServiceRecord_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentServiceRecord" ADD CONSTRAINT "EquipmentServiceRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;
