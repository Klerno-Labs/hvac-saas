-- Keep a durable one-to-one link between an approved estimate and its invoice.
-- Existing invoices remain unchanged; no backfill guesses are made.
ALTER TABLE "Invoice" ADD COLUMN "sourceEstimateId" TEXT;
CREATE UNIQUE INDEX "Invoice_sourceEstimateId_key" ON "Invoice"("sourceEstimateId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sourceEstimateId_fkey"
  FOREIGN KEY ("sourceEstimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
