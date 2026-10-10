-- CreateEnum
CREATE TYPE "OrganizationScope" AS ENUM ('DEPARTMENTAL', 'COLLEGE_WIDE', 'UNIVERSITY_WIDE', 'CO_CURRICULAR');

-- CreateEnum
CREATE TYPE "MembershipSource" AS ENUM ('ADMIN', 'JOIN_CODE', 'JOIN_REQUEST', 'AUTO_MAPPING');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrganizationRole" ADD VALUE 'SECRETARY';
ALTER TYPE "OrganizationRole" ADD VALUE 'AUDITOR';

-- AlterTable
ALTER TABLE "organization_members" ADD COLUMN     "semester_id" UUID,
ADD COLUMN     "source" "MembershipSource" NOT NULL DEFAULT 'ADMIN';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "auto_enroll" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "college_id" UUID,
ADD COLUMN     "department_id" UUID,
ADD COLUMN     "program_id" UUID,
ADD COLUMN     "scope" "OrganizationScope" NOT NULL DEFAULT 'CO_CURRICULAR';

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "photo_key" TEXT,
ADD COLUMN     "program_id" UUID,
ADD COLUMN     "rfid_uid" TEXT;

-- CreateTable
CREATE TABLE "school_years" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" UUID NOT NULL,
    "school_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colleges" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "colleges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "college_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "year_level" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "join_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_years_label_key" ON "school_years"("label");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_school_year_id_sequence_key" ON "semesters"("school_year_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "colleges_code_key" ON "colleges"("code");

-- CreateIndex
CREATE UNIQUE INDEX "colleges_name_key" ON "colleges"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_college_id_code_key" ON "departments"("college_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_college_id_name_key" ON "departments"("college_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "programs_code_key" ON "programs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "programs_department_id_name_key" ON "programs"("department_id", "name");

-- CreateIndex
CREATE INDEX "student_enrollments_program_id_semester_id_idx" ON "student_enrollments"("program_id", "semester_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_user_id_semester_id_key" ON "student_enrollments"("user_id", "semester_id");

-- CreateIndex
CREATE INDEX "join_requests_organization_id_status_idx" ON "join_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "join_requests_user_id_idx" ON "join_requests"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_rfid_uid_key" ON "student_profiles"("rfid_uid");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written integrity rules.
-- Exactly one active school year and one active semester at a time.
CREATE UNIQUE INDEX "school_years_one_active_key" ON "school_years" ("active") WHERE "active";
CREATE UNIQUE INDEX "semesters_one_active_key" ON "semesters" ("active") WHERE "active";
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_dates_check" CHECK ("ends_on" > "starts_on");
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_dates_check" CHECK ("ends_on" > "starts_on");
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_year_check" CHECK ("year_level" BETWEEN 1 AND 10);
-- A person can have only one pending request per organization.
CREATE UNIQUE INDEX "join_requests_one_pending_key" ON "join_requests" ("organization_id", "user_id") WHERE "status" = 'PENDING';
-- An organization's scope must match its academic links.
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_scope_check" CHECK (
  ("scope" = 'DEPARTMENTAL' AND "department_id" IS NOT NULL AND "college_id" IS NOT NULL)
  OR ("scope" = 'COLLEGE_WIDE' AND "college_id" IS NOT NULL AND "department_id" IS NULL AND "program_id" IS NULL)
  OR ("scope" IN ('UNIVERSITY_WIDE','CO_CURRICULAR'))
);
