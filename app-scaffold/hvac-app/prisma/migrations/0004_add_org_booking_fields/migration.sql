-- Add booking fields to Organization (2026-07-21 — completes lib/booking.ts)
ALTER TABLE "Organization" ADD COLUMN "bookingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "bookingSlug" TEXT;
CREATE UNIQUE INDEX "Organization_bookingSlug_key" ON "Organization"("bookingSlug");
