-- AlterTable: Add deposit fields to Estimate
ALTER TABLE "Estimate" ADD COLUMN "depositRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Estimate" ADD COLUMN "depositType" TEXT;
ALTER TABLE "Estimate" ADD COLUMN "depositPercent" DOUBLE PRECISION;
ALTER TABLE "Estimate" ADD COLUMN "depositFixedCents" INTEGER;
ALTER TABLE "Estimate" ADD COLUMN "depositStatus" TEXT;
ALTER TABLE "Estimate" ADD COLUMN "depositPaidAt" TIMESTAMP(3);

-- AlterTable: Make Payment.invoiceId optional (deposit payments have no invoice)
ALTER TABLE "Payment" ALTER COLUMN "invoiceId" DROP NOT NULL;

-- DropForeignKey: Remove old CASCADE FK on Payment.invoiceId
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_invoiceId_fkey";

-- AddForeignKey: Re-add with SET NULL so deleting an invoice nullifies the payment's invoiceId
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
