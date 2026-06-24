-- CreateTable
CREATE TABLE "PriceBookItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "flatPriceCents" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBookItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionGroupOption" (
    "id" TEXT NOT NULL,
    "optionGroupId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionGroupOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceBookItem_organizationId_idx" ON "PriceBookItem"("organizationId");

-- CreateIndex
CREATE INDEX "OptionGroup_organizationId_idx" ON "OptionGroup"("organizationId");

-- CreateIndex
CREATE INDEX "OptionGroupOption_optionGroupId_idx" ON "OptionGroupOption"("optionGroupId");

-- CreateIndex
CREATE INDEX "OptionGroupOption_organizationId_idx" ON "OptionGroupOption"("organizationId");

-- AddForeignKey
ALTER TABLE "PriceBookItem" ADD CONSTRAINT "PriceBookItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupOption" ADD CONSTRAINT "OptionGroupOption_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupOption" ADD CONSTRAINT "OptionGroupOption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
