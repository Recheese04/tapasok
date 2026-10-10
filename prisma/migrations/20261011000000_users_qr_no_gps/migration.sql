-- Safety guard: geolocation is being removed from attendance. Refuse to run if any coordinates are stored,
-- so no data can be lost silently. (Events and attendance rows themselves are never deleted.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "events" WHERE "latitude" IS NOT NULL OR "longitude" IS NOT NULL OR "geofence_radius_m" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "attendance_records" WHERE "latitude" IS NOT NULL OR "longitude" IS NOT NULL OR "accuracy_m" IS NOT NULL) THEN
    RAISE EXCEPTION 'Geolocation data exists; export or clear it deliberately before applying this migration.';
  END IF;
END $$;

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_geofence_check";
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_coordinates_check";

-- AlterTable
ALTER TABLE "attendance_records" DROP COLUMN "accuracy_m",
DROP COLUMN "latitude",
DROP COLUMN "longitude";

-- AlterTable
ALTER TABLE "event_sessions" ADD COLUMN     "qr_epoch" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "events" DROP COLUMN "geofence_radius_m",
DROP COLUMN "latitude",
DROP COLUMN "longitude";

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_id" TEXT NOT NULL,
    "middle_name" TEXT,
    "contact_number" TEXT,
    "college_id" UUID,
    "department_id" UUID,
    "job_title" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_user_id_key" ON "staff_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_employee_id_key" ON "staff_profiles"("employee_id");

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

