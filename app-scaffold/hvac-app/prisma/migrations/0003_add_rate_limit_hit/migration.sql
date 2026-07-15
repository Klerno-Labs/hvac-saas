-- CreateTable
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "hitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimitHit_bucket_identifier_hitAt_idx" ON "RateLimitHit"("bucket", "identifier", "hitAt");

-- CreateIndex
CREATE INDEX "RateLimitHit_hitAt_idx" ON "RateLimitHit"("hitAt");
