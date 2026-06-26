-- AlterTable: add job completion notice fields to Organization and Job

ALTER TABLE "Organization" ADD COLUMN "jobCompletionNoticeEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Job" ADD COLUMN "completionNoticeSentAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "completionNoticeChannels" TEXT;
