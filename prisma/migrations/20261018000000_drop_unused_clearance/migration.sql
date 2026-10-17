-- Remove the semester-clearance tables. They were created for a planned clearance workflow that was never built: no
-- page, app screen or API ever wrote to them. Safety: if either table holds any row, stop here and change nothing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "clearance_signoffs") OR EXISTS (SELECT 1 FROM "clearance_requests") THEN
    RAISE EXCEPTION 'clearance tables are not empty; refusing to drop them';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "clearance_requests" DROP CONSTRAINT "clearance_requests_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "clearance_requests" DROP CONSTRAINT "clearance_requests_semester_id_fkey";

-- DropForeignKey
ALTER TABLE "clearance_requests" DROP CONSTRAINT "clearance_requests_user_id_fkey";

-- DropForeignKey
ALTER TABLE "clearance_signoffs" DROP CONSTRAINT "clearance_signoffs_request_id_fkey";

-- DropForeignKey
ALTER TABLE "clearance_signoffs" DROP CONSTRAINT "clearance_signoffs_signed_by_id_fkey";

-- DropTable
DROP TABLE "clearance_requests";

-- DropTable
DROP TABLE "clearance_signoffs";

-- DropEnum
DROP TYPE "ClearanceStatus";

-- DropEnum
DROP TYPE "SignoffDecision";

