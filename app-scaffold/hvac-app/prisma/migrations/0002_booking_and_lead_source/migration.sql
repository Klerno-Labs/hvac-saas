-- Online-booking widget + lead-source capture.
-- Additive only: nullable columns + one new table. No data backfill required.

-- Organization: public booking slug + opt-in flag
ALTER TABLE "Organization" ADD COLUMN "publicSlug" TEXT;
ALTER TABLE "Organization" ADD COLUMN "bookingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Lead-source attribution on Customer and Job (nullable for existing rows + manual entry)
ALTER TABLE "Customer" ADD COLUMN "leadSource" TEXT;
ALTER TABLE "Job" ADD COLUMN "leadSource" TEXT;

-- CreateTable: inbound booking requests (leads) pending office confirmation
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "customerFirstName" TEXT NOT NULL,
    "customerLastName" TEXT,
    "companyName" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "serviceType" TEXT NOT NULL,
    "preferredDate" TIMESTAMP(3),
    "preferredWindow" TEXT NOT NULL DEFAULT 'anytime',
    "description" TEXT,
    "leadSource" TEXT NOT NULL DEFAULT 'web_booking',
    "sourceIp" TEXT,
    "convertedCustomerId" TEXT,
    "convertedJobId" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_publicSlug_key" ON "Organization"("publicSlug");
CREATE UNIQUE INDEX "BookingRequest_convertedJobId_key" ON "BookingRequest"("convertedJobId");
CREATE INDEX "BookingRequest_organizationId_idx" ON "BookingRequest"("organizationId");
CREATE INDEX "BookingRequest_organizationId_status_idx" ON "BookingRequest"("organizationId", "status");
CREATE INDEX "BookingRequest_sourceIp_idx" ON "BookingRequest"("sourceIp");

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_convertedCustomerId_fkey" FOREIGN KEY ("convertedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_convertedJobId_fkey" FOREIGN KEY ("convertedJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
