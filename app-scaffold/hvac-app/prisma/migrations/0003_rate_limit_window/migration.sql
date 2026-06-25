-- CreateTable: sliding-window rate limit entries (pre-auth, org-agnostic).
-- Identifiers are SHA-256 hashes of (ip|hashedId) — never raw PII.
CREATE TABLE "RateLimitEntry" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitEntry_bucket_identifier_timestamp_idx" ON "RateLimitEntry"("bucket", "identifier", "timestamp");
CREATE INDEX "RateLimitEntry_createdAt_idx" ON "RateLimitEntry"("createdAt");
