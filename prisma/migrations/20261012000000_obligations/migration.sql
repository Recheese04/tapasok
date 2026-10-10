-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "obligations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "completion_requirements" TEXT,
    "due_at" TIMESTAMPTZ(3),
    "status" "ObligationStatus" NOT NULL DEFAULT 'PENDING',
    "member_note" TEXT,
    "submitted_at" TIMESTAMPTZ(3),
    "completion_note" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "obligations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "obligations_organization_id_status_idx" ON "obligations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "obligations_user_id_status_idx" ON "obligations"("user_id", "status");

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

