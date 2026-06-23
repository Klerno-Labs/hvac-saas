-- AlterTable: extend AccountingSyncRecord for real QBO sync (provider, SyncToken, metadata)
ALTER TABLE "AccountingSyncRecord" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'quickbooks',
ADD COLUMN "syncToken" TEXT,
ADD COLUMN "metadataJson" JSONB;

-- CreateTable: per-org QBO OAuth2 token store (rotating access + refresh tokens)
CREATE TABLE "AccountingConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'quickbooks',
    "realmId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "defaultTaxCodeRef" TEXT,
    "defaultItemRef" TEXT,
    "scope" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable: org-scoped mapping of an internal label to a QBO TaxCode ref
CREATE TABLE "TaxCodeMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "qboTaxCodeId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCodeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingConnection_organizationId_key" ON "AccountingConnection"("organizationId");
CREATE UNIQUE INDEX "TaxCodeMapping_organizationId_label_key" ON "TaxCodeMapping"("organizationId", "label");
CREATE INDEX "TaxCodeMapping_organizationId_idx" ON "TaxCodeMapping"("organizationId");

-- AddForeignKey
ALTER TABLE "AccountingConnection" ADD CONSTRAINT "AccountingConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxCodeMapping" ADD CONSTRAINT "TaxCodeMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
