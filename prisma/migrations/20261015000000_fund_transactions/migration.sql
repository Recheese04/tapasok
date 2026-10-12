-- CreateEnum
CREATE TYPE "FundTransactionType" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "FundCategory" AS ENUM ('SUPPLIES', 'EVENT_MATERIALS', 'PRINTING', 'TRANSPORTATION', 'FOOD', 'VENUE', 'SERVICES', 'OPENING_BALANCE', 'DONATION', 'SPONSORSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "FundTransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVERSED');

-- CreateTable
CREATE TABLE "fund_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "FundTransactionType" NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" "FundCategory" NOT NULL,
    "occurred_on" DATE NOT NULL,
    "purpose" TEXT NOT NULL,
    "notes" TEXT,
    "status" "FundTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "request_id" TEXT NOT NULL,
    "receipt_key" TEXT,
    "receipt_mime" TEXT,
    "receipt_name" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_reason" TEXT,
    "reversed_by_id" UUID,
    "reversed_at" TIMESTAMPTZ(3),
    "reversal_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fund_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_audit_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "amount" DECIMAL(12,2),
    "actor_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fund_transactions_request_id_key" ON "fund_transactions"("request_id");

-- CreateIndex
CREATE INDEX "fund_transactions_organization_id_status_occurred_on_idx" ON "fund_transactions"("organization_id", "status", "occurred_on");

-- CreateIndex
CREATE INDEX "financial_audit_entries_organization_id_created_at_idx" ON "financial_audit_entries"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "financial_audit_entries_entity_type_entity_id_idx" ON "financial_audit_entries"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_audit_entries" ADD CONSTRAINT "financial_audit_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_audit_entries" ADD CONSTRAINT "financial_audit_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written guards ----------------------------------------------------------------------------------------------

-- Amounts are always positive; the type says whether money came in or went out.
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_category_matches_type" CHECK (
  ("type" = 'EXPENSE' AND "category" IN ('SUPPLIES','EVENT_MATERIALS','PRINTING','TRANSPORTATION','FOOD','VENUE','SERVICES','OTHER'))
  OR ("type" = 'INCOME' AND "category" IN ('OPENING_BALANCE','DONATION','SPONSORSHIP','OTHER'))
);
-- Whoever decides must not be whoever recorded (independent approval).
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_independent_decision" CHECK ("decided_by_id" IS NULL OR "decided_by_id" <> "recorded_by_id");

-- The financial audit trail is append-only: the database refuses to change or remove an entry.
CREATE OR REPLACE FUNCTION financial_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'financial_audit_entries is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER financial_audit_no_update BEFORE UPDATE ON "financial_audit_entries" FOR EACH ROW EXECUTE FUNCTION financial_audit_append_only();
CREATE TRIGGER financial_audit_no_delete BEFORE DELETE ON "financial_audit_entries" FOR EACH ROW EXECUTE FUNCTION financial_audit_append_only();
