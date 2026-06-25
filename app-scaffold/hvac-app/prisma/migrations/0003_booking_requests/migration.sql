-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "bookingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "bookingSlug" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "leadSource" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "leadSource" TEXT;

-- CreateTable
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "preferredWindow" TEXT,
    "contactName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "leadSource" TEXT,
    "customerId" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_bookingSlug_key" ON "Organization"("bookingSlug");

-- CreateIndex
CREATE INDEX "BookingRequest_organizationId_idx" ON "BookingRequest"("organizationId");

-- CreateIndex
CREATE INDEX "BookingRequest_status_idx" ON "BookingRequest"("status");

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
