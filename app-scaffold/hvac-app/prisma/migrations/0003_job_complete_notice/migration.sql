-- AlterTable
ALTER TABLE "Job" ADD COLUMN "completionNoticeSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "jobCompletionNoticeEnabled" BOOLEAN NOT NULL DEFAULT false;
