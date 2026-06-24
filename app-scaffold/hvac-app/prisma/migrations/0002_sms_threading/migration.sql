-- 0002_sms_threading
-- Two-way SMS plumbing (inbound threading, opt-out compliance, templates).
--
-- !!! DB MIGRATION — REQUIRES APPLYING IN ALL ENVIRONMENTS !!!
-- Apply with:  npx prisma migrate deploy
-- (or `npx prisma migrate dev` in local dev, which also regenerates the client)
--
-- Adds:
--   * Organization.tenDlcRegistered  — A2P 10DLC registration gate (sends blocked until true)
--   * SmsMessage                     — org-scoped inbound/outbound thread
--   * SmsOptOut                      — per-org, per-phone STOP/START compliance state

-- A2P 10DLC gate on Organization
ALTER TABLE "Organization" ADD COLUMN "tenDlcRegistered" BOOLEAN NOT NULL DEFAULT false;

-- Conversation thread (org-scoped; one inbound may fan out to N orgs)
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "jobId" TEXT,
    "direction" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerMessageSid" TEXT,
    "templateSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- NOTE: providerMessageSid is nullable; Postgres allows multiple NULLs in a
-- unique index, so outbound rows without a Sid do not collide.
CREATE UNIQUE INDEX "SmsMessage_organizationId_providerMessageSid_key" ON "SmsMessage"("organizationId", "providerMessageSid");
CREATE INDEX "SmsMessage_organizationId_idx" ON "SmsMessage"("organizationId");
CREATE INDEX "SmsMessage_organizationId_customerId_idx" ON "SmsMessage"("organizationId", "customerId");
CREATE INDEX "SmsMessage_organizationId_toNumber_idx" ON "SmsMessage"("organizationId", "toNumber");
CREATE INDEX "SmsMessage_customerId_idx" ON "SmsMessage"("customerId");

ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Per-org, per-phone opt-out state
CREATE TABLE "SmsOptOut" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "optOutType" TEXT NOT NULL DEFAULT 'stop',
    "reason" TEXT,
    "liftedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsOptOut_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SmsOptOut_organizationId_phone_key" ON "SmsOptOut"("organizationId", "phone");
CREATE INDEX "SmsOptOut_organizationId_phone_idx" ON "SmsOptOut"("organizationId", "phone");

ALTER TABLE "SmsOptOut" ADD CONSTRAINT "SmsOptOut_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
