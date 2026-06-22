-- Sales-tax engine: org default rate, per-customer exemption, per-line taxable flag + rate override.
-- Existing documents keep their hand-entered "taxCents"; tax is recomputed only on create/edit.
-- defaultTaxRateBps defaults to 0 (no tax) so existing orgs are unaffected until configured.

-- Organization: default sales-tax rate in basis points (1 bps = 0.01%; 825 = 8.25%)
ALTER TABLE "Organization" ADD COLUMN "defaultTaxRateBps" INTEGER NOT NULL DEFAULT 0;

-- Customer: per-customer tax exemption (e.g. resale certificate, government, non-profit)
ALTER TABLE "Customer" ADD COLUMN "taxExempt" BOOLEAN NOT NULL DEFAULT false;

-- EstimateLineItem: taxable flag + optional per-line rate override (null = inherit org default)
ALTER TABLE "EstimateLineItem" ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EstimateLineItem" ADD COLUMN "taxRateBps" INTEGER;

-- InvoiceLineItem: taxable flag + optional per-line rate override (null = inherit org default)
ALTER TABLE "InvoiceLineItem" ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "InvoiceLineItem" ADD COLUMN "taxRateBps" INTEGER;
