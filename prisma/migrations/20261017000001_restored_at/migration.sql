-- When a soft-deleted record was last restored, so screens can mark it "Restored". Additive only.
-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "restored_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "restored_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "event_images" ADD COLUMN     "restored_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "restored_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "site_feedback" ADD COLUMN     "restored_at" TIMESTAMPTZ(3);

