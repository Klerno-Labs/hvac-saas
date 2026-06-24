-- AlterTable
-- Tracks whether the job-complete lifecycle notice has been sent to the
-- customer. Used as an idempotency guard so re-completing a job does not
-- spam the customer with duplicate completion notices.
ALTER TABLE "Job" ADD COLUMN "completionNoticeSentAt" TIMESTAMP(3);
