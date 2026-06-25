-- AlterTable
ALTER TABLE "Job" ADD COLUMN "assignedUserId" TEXT;

-- CreateIndex
CREATE INDEX "Job_assignedUserId_idx" ON "Job"("assignedUserId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
