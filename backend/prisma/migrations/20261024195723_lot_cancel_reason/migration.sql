-- AlterTable
ALTER TABLE "lots" ADD COLUMN     "cancel_reason" TEXT;

-- A cancellation reason only exists on a cancelled lot.
ALTER TABLE "lots" ADD CONSTRAINT "lots_cancel_reason_requires_cancellation" CHECK ("cancel_reason" IS NULL OR "cancelled_at" IS NOT NULL);
