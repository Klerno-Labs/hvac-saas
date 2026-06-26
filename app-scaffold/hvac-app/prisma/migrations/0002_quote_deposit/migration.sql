-- AlterTable: add deposit + acceptance fields to Estimate
ALTER TABLE "Estimate" ADD COLUMN "depositRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Estimate" ADD COLUMN "depositType" TEXT;
ALTER TABLE "Estimate" ADD COLUMN "depositPercent" DOUBLE PRECISION;
ALTER TABLE "Estimate" ADD COLUMN "depositFixedCents" INTEGER;
ALTER TABLE "Estimate" ADD COLUMN "depositAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Estimate" ADD COLUMN "depositStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Estimate" ADD COLUMN "depositPaidAt" TIMESTAMP(3);
ALTER TABLE "Estimate" ADD COLUMN "acceptedOptionKey" TEXT;

-- AlterTable: make invoiceId nullable so Payment can represent a deposit
ALTER TABLE "Payment" ALTER COLUMN "invoiceId" DROP NOT NULL;

-- AlterTable: add estimateId + kind to Payment
ALTER TABLE "Payment" ADD COLUMN "estimateId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'invoice';

-- CreateIndex
CREATE INDEX "Payment_organizationId_idx" ON "Payment"("organizationId");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE INDEX "Payment_estimateId_idx" ON "Payment"("estimateId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
