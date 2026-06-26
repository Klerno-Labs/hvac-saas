-- AlterTable: Customer add leadSource
ALTER TABLE "Customer" ADD COLUMN "leadSource" TEXT;

-- AlterTable: Job add leadSource
ALTER TABLE "Job" ADD COLUMN "leadSource" TEXT;

-- AlterTable: Organization add booking fields
ALTER TABLE "Organization" ADD COLUMN "bookingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "bookingSlug" TEXT;

-- CreateIndex: unique bookingSlug
CREATE UNIQUE INDEX "Organization_bookingSlug_key" ON "Organization"("bookingSlug");

-- CreateTable: BookingRequest
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "preferredWindow" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "leadSource" TEXT NOT NULL DEFAULT 'web',
    "status" TEXT NOT NULL DEFAULT 'new',
    "customerId" TEXT,
    "jobId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingRequest_organizationId_idx" ON "BookingRequest"("organizationId");

-- CreateIndex
CREATE INDEX "BookingRequest_status_idx" ON "BookingRequest"("status");

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
