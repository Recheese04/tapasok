-- Landing-page event pictures, site feedback (ratings and comments), and soft delete (deleted_at / deleted_by_id) for events,
-- announcements and documents. Additive only: no existing row is changed or removed.
-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'APPROVED', 'HIDDEN');

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "deleted_by_id" UUID;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "deleted_by_id" UUID;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "deleted_by_id" UUID,
ADD COLUMN     "show_on_landing" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "event_images" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "content" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "alt_text" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" UUID,

    CONSTRAINT "event_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_feedback" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "moderated_by_id" UUID,
    "moderated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" UUID,

    CONSTRAINT "site_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_images_event_id_deleted_at_position_idx" ON "event_images"("event_id", "deleted_at", "position");

-- CreateIndex
CREATE INDEX "site_feedback_status_deleted_at_updated_at_idx" ON "site_feedback"("status", "deleted_at", "updated_at");

-- AddForeignKey
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_feedback" ADD CONSTRAINT "site_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One ACTIVE feedback entry per account; deleted entries do not block a new one.
CREATE UNIQUE INDEX "site_feedback_one_active_per_user" ON "site_feedback"("user_id") WHERE "deleted_at" IS NULL;
ALTER TABLE "site_feedback" ADD CONSTRAINT "site_feedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "site_feedback" ADD CONSTRAINT "site_feedback_comment_check" CHECK ("comment" IS NULL OR char_length("comment") BETWEEN 1 AND 500);

-- Only processed pictures of a bounded size are ever stored.
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_mime_check" CHECK ("mime" = 'image/webp');
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 2097152 AND octet_length("content") = "byte_size");
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_dims_check" CHECK ("width" BETWEEN 1 AND 4096 AND "height" BETWEEN 1 AND 4096);
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_alt_check" CHECK ("alt_text" IS NULL OR char_length("alt_text") <= 200);

-- A deleted row always records when; listing queries filter on deleted_at.
CREATE INDEX "events_org_deleted_idx" ON "events"("organization_id", "deleted_at");
CREATE INDEX "events_landing_idx" ON "events"("show_on_landing") WHERE "show_on_landing" AND "deleted_at" IS NULL;
CREATE INDEX "announcements_org_deleted_idx" ON "announcements"("organization_id", "deleted_at");
