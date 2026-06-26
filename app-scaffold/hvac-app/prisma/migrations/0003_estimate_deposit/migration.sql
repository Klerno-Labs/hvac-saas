-- AlterTable: add deposit tracking fields to Estimate
ALTER TABLE "Estimate" ADD COLUMN "depositStatus"      TEXT    NOT NULL DEFAULT 'none';
ALTER TABLE "Estimate" ADD COLUMN "depositAmountCents"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Estimate" ADD COLUMN "depositPaidAt"       TIMESTAMP(3);

-- AlterTable: extend Payment to support estimate deposits
ALTER TABLE "Payment" ADD COLUMN "estimateId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "kind"        TEXT NOT NULL DEFAULT 'payment';
ALTER TABLE "Payment" ALTER COLUMN "invoiceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_estimateId_fkey"
  FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
