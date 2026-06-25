-- Dunning tracking for platform-subscription payment failures.
-- Idempotency: dunningLastSentInvoiceId gates one email per failed invoice;
-- cleared on payment_succeeded. dunningAttempt counts retries per invoice.
ALTER TABLE "Organization" ADD COLUMN "dunningLastSentInvoiceId" TEXT;
ALTER TABLE "Organization" ADD COLUMN "dunningAttempt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organization" ADD COLUMN "dunningLastSentAt" TIMESTAMP(3);
