-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('TIME_IN', 'TIME_OUT');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('RFID', 'QR_SELF', 'OFFICER_SCAN', 'MANUAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EventTargetMode" AS ENUM ('ALL_MEMBERS', 'FILTERED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttendanceStatus" ADD VALUE 'ABSENT';
ALTER TYPE "AttendanceStatus" ADD VALUE 'EXCUSED';

-- DropIndex
DROP INDEX "attendance_records_event_id_user_id_key";

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "accuracy_m" INTEGER,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "modified_at" TIMESTAMPTZ(3),
ADD COLUMN     "modified_by_id" UUID,
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "session_id" UUID,
ADD COLUMN     "source" "AttendanceSource" NOT NULL DEFAULT 'OFFICER_SCAN';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "geofence_radius_m" INTEGER,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "require_evaluation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "semester_id" UUID,
ADD COLUMN     "target_mode" "EventTargetMode" NOT NULL DEFAULT 'ALL_MEMBERS';

-- CreateTable
CREATE TABLE "event_sessions" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "SessionKind" NOT NULL DEFAULT 'TIME_IN',
    "position" INTEGER NOT NULL,
    "opens_at" TIMESTAMPTZ(3) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "closes_at" TIMESTAMPTZ(3) NOT NULL,
    "grace_minutes" INTEGER NOT NULL DEFAULT 15,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "finalized_at" TIMESTAMPTZ(3),
    "finalized_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_targets" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "college_id" UUID,
    "department_id" UUID,
    "program_id" UUID,
    "year_level" INTEGER,

    CONSTRAINT "event_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scanner_devices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanner_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_sessions_event_id_position_key" ON "event_sessions"("event_id", "position");

-- CreateIndex
CREATE INDEX "event_targets_event_id_idx" ON "event_targets"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "scanner_devices_key_hash_key" ON "scanner_devices"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "scanner_devices_organization_id_name_key" ON "scanner_devices"("organization_id", "name");

-- CreateIndex
CREATE INDEX "attendance_records_event_id_idx" ON "attendance_records"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_session_id_user_id_key" ON "attendance_records"("session_id", "user_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_targets" ADD CONSTRAINT "event_targets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_devices" ADD CONSTRAINT "scanner_devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Backfill: every existing event gets one session carrying its original attendance window, and existing
-- attendance rows are attached to it, so no history is lost.
INSERT INTO "event_sessions" ("id", "event_id", "label", "kind", "position", "opens_at", "starts_at", "closes_at", "grace_minutes", "active")
SELECT gen_random_uuid(), e."id", 'Attendance', 'TIME_IN', 1, e."attendance_opens_at", e."starts_at", e."attendance_closes_at", 15, false
FROM "events" e;

UPDATE "attendance_records" ar
SET "session_id" = (SELECT s."id" FROM "event_sessions" s WHERE s."event_id" = ar."event_id" AND s."position" = 1);

ALTER TABLE "attendance_records" ALTER COLUMN "session_id" SET NOT NULL;

-- Hand-written integrity rules.
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_times_check"
  CHECK ("closes_at" > "opens_at" AND "starts_at" >= "opens_at" AND "starts_at" < "closes_at" AND "grace_minutes" BETWEEN 0 AND 240);
ALTER TABLE "events" ADD CONSTRAINT "events_geofence_check"
  CHECK ("geofence_radius_m" IS NULL OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "geofence_radius_m" BETWEEN 10 AND 5000));
ALTER TABLE "events" ADD CONSTRAINT "events_coordinates_check"
  CHECK (("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90) AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180));
ALTER TABLE "event_targets" ADD CONSTRAINT "event_targets_nonempty_check"
  CHECK ("college_id" IS NOT NULL OR "department_id" IS NOT NULL OR "program_id" IS NOT NULL OR "year_level" IS NOT NULL);
