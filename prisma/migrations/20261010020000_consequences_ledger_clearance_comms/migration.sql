-- CreateEnum
CREATE TYPE "RuleTrigger" AS ENUM ('ABSENT', 'LATE');

-- CreateEnum
CREATE TYPE "PenaltyType" AS ENUM ('FINE', 'SERVICE_HOURS');

-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('DUES', 'SEMESTER_FEE', 'EVENT_CONTRIBUTION', 'SPECIAL', 'FINE');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('WAIVER', 'DISCOUNT', 'CORRECTION', 'CHARGE', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CONFIRMED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClearanceStatus" AS ENUM ('REQUESTED', 'ELIGIBLE', 'CLEARED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SignoffDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('MINUTES', 'ATTENDANCE_SHEET', 'RESOLUTION', 'EVENT_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ThreadKind" AS ENUM ('GROUP', 'DIRECT');

-- AlterEnum
ALTER TYPE "ConsequenceStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'LIKERT';

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "semester_id" UUID,
ADD COLUMN     "target_mode" "EventTargetMode" NOT NULL DEFAULT 'ALL_MEMBERS';

-- AlterTable
ALTER TABLE "consequence_rules" ADD COLUMN     "fine_amount" DECIMAL(10,2),
ADD COLUMN     "penalty_type" "PenaltyType" NOT NULL DEFAULT 'FINE',
ADD COLUMN     "service_hours" DECIMAL(5,1),
ADD COLUMN     "session_kind" "SessionKind",
ADD COLUMN     "trigger" "RuleTrigger" NOT NULL DEFAULT 'ABSENT',
ADD COLUMN     "whole_day" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "consequences" ADD COLUMN     "amount" DECIMAL(10,2),
ADD COLUMN     "calculated_at" TIMESTAMPTZ(3),
ADD COLUMN     "hours" DECIMAL(5,1),
ADD COLUMN     "kind" "PenaltyType" NOT NULL DEFAULT 'FINE',
ADD COLUMN     "session_id" UUID,
ADD COLUMN     "source_record_id" UUID;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "event_id" UUID,
ADD COLUMN     "semester_id" UUID;

-- AlterTable
ALTER TABLE "fee_types" ADD COLUMN     "event_id" UUID,
ADD COLUMN     "kind" "AssessmentKind" NOT NULL DEFAULT 'DUES',
ADD COLUMN     "semester_id" UUID;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "proof_key" TEXT,
ADD COLUMN     "proof_mime" TEXT,
ADD COLUMN     "receipt_code" TEXT,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'CONFIRMED',
ADD COLUMN     "submitted_by_id" UUID,
ADD COLUMN     "verified_at" TIMESTAMPTZ(3),
ADD COLUMN     "verified_by_id" UUID;

-- AlterTable
ALTER TABLE "student_fees" ADD COLUMN     "consequence_id" UUID,
ADD COLUMN     "event_id" UUID,
ADD COLUMN     "kind" "AssessmentKind" NOT NULL DEFAULT 'DUES',
ADD COLUMN     "organization_id" UUID,
ADD COLUMN     "semester_id" UUID,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "fee_type_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "event_rules" (
    "event_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,

    CONSTRAINT "event_rules_pkey" PRIMARY KEY ("event_id","rule_id")
);

-- CreateTable
CREATE TABLE "ledger_adjustments" (
    "id" UUID NOT NULL,
    "student_fee_id" UUID NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearance_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "status" "ClearanceStatus" NOT NULL DEFAULT 'REQUESTED',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eligible_at" TIMESTAMPTZ(3),
    "issued_at" TIMESTAMPTZ(3),
    "certificate_code" TEXT,

    CONSTRAINT "clearance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearance_signoffs" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "signed_by_id" UUID NOT NULL,
    "decision" "SignoffDecision" NOT NULL,
    "note" TEXT,
    "signed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clearance_signoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_targets" (
    "id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "college_id" UUID,
    "department_id" UUID,
    "program_id" UUID,
    "year_level" INTEGER,

    CONSTRAINT "announcement_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_threads" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" "ThreadKind" NOT NULL,
    "title" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_participants" (
    "thread_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ(3),

    CONSTRAINT "thread_participants_pkey" PRIMARY KEY ("thread_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_adjustments_student_fee_id_idx" ON "ledger_adjustments"("student_fee_id");

-- CreateIndex
CREATE UNIQUE INDEX "clearance_requests_certificate_code_key" ON "clearance_requests"("certificate_code");

-- CreateIndex
CREATE INDEX "clearance_requests_organization_id_status_idx" ON "clearance_requests"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "clearance_requests_user_id_organization_id_semester_id_key" ON "clearance_requests"("user_id", "organization_id", "semester_id");

-- CreateIndex
CREATE UNIQUE INDEX "clearance_signoffs_request_id_role_key" ON "clearance_signoffs"("request_id", "role");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "announcement_targets_announcement_id_idx" ON "announcement_targets"("announcement_id");

-- CreateIndex
CREATE INDEX "message_threads_organization_id_last_message_at_idx" ON "message_threads"("organization_id", "last_message_at");

-- CreateIndex
CREATE INDEX "thread_participants_user_id_idx" ON "thread_participants"("user_id");

-- CreateIndex
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_code_key" ON "payments"("receipt_code");

-- CreateIndex
CREATE UNIQUE INDEX "student_fees_consequence_id_key" ON "student_fees"("consequence_id");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consequences" ADD CONSTRAINT "consequences_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_types" ADD CONSTRAINT "fee_types_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_types" ADD CONSTRAINT "fee_types_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_consequence_id_fkey" FOREIGN KEY ("consequence_id") REFERENCES "consequences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rules" ADD CONSTRAINT "event_rules_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rules" ADD CONSTRAINT "event_rules_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "consequence_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT "ledger_adjustments_student_fee_id_fkey" FOREIGN KEY ("student_fee_id") REFERENCES "student_fees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_signoffs" ADD CONSTRAINT "clearance_signoffs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "clearance_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_signoffs" ADD CONSTRAINT "clearance_signoffs_signed_by_id_fkey" FOREIGN KEY ("signed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Backfill existing ledger data so nothing is lost: each existing assessment takes its organization and name from its
-- fee type, and every existing payment gets a unique receipt code.
UPDATE "student_fees" sf
SET "organization_id" = ft."organization_id", "title" = ft."name"
FROM "fee_types" ft WHERE ft."id" = sf."fee_type_id";
ALTER TABLE "student_fees" ALTER COLUMN "organization_id" SET NOT NULL, ALTER COLUMN "title" SET NOT NULL;

UPDATE "payments"
SET "receipt_code" = 'TPK-' || to_char("created_at" AT TIME ZONE 'Asia/Manila', 'YYYYMMDD') || '-' || upper(substr(replace("id"::text, '-', ''), 1, 8));
ALTER TABLE "payments" ALTER COLUMN "receipt_code" SET NOT NULL;

-- Hand-written integrity rules.
ALTER TABLE "consequence_rules" ADD CONSTRAINT "consequence_rules_penalty_check"
  CHECK (("fine_amount" IS NULL OR "fine_amount" > 0) AND ("service_hours" IS NULL OR "service_hours" > 0));
ALTER TABLE "consequences" ADD CONSTRAINT "consequences_amount_check"
  CHECK (("amount" IS NULL OR "amount" > 0) AND ("hours" IS NULL OR "hours" > 0));
-- Automatic calculation can never create the same consequence twice: one per rule + session + student,
-- and one per rule + event + student for whole-day rules.
CREATE UNIQUE INDEX "consequences_auto_session_key" ON "consequences" ("rule_id", "session_id", "user_id")
  WHERE "calculated_at" IS NOT NULL AND "session_id" IS NOT NULL;
CREATE UNIQUE INDEX "consequences_auto_event_key" ON "consequences" ("rule_id", "event_id", "user_id")
  WHERE "calculated_at" IS NOT NULL AND "session_id" IS NULL;
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT "ledger_adjustments_amount_check" CHECK ("amount" <> 0);
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_title_check" CHECK ("kind" = 'DIRECT' OR "title" IS NOT NULL);
-- A student has one clearance request per organization and semester (unique index above); a cleared one carries a code.
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_cleared_check" CHECK ("status" <> 'CLEARED' OR ("certificate_code" IS NOT NULL AND "issued_at" IS NOT NULL));
