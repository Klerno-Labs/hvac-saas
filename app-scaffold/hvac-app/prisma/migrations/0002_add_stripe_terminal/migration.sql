-- Add Stripe Terminal enable flag to Organization (gates in-field card payments).
ALTER TABLE "Organization" ADD COLUMN "stripeTerminalEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Record how a Payment was collected ("checkout" | "terminal"). Existing rows backfill to "checkout".
ALTER TABLE "Payment" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'checkout';
