-- CreateTable
CREATE TABLE "organization_join_codes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "code_hint" TEXT NOT NULL,
    "created_by_id" UUID,
    "expires_at" TIMESTAMPTZ(3),
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_join_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_join_codes_code_hash_key" ON "organization_join_codes"("code_hash");

-- CreateIndex
CREATE INDEX "organization_join_codes_organization_id_created_at_idx" ON "organization_join_codes"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "organization_join_codes" ADD CONSTRAINT "organization_join_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_join_codes" ADD CONSTRAINT "organization_join_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written constraints that Prisma's schema language cannot express.

-- An organization has at most one non-revoked join code; regenerating revokes the old one first.
CREATE UNIQUE INDEX "organization_join_codes_one_active_per_org_key"
  ON "organization_join_codes" ("organization_id")
  WHERE "revoked_at" IS NULL;

-- Safety net behind the atomic redemption update: the use limit can never be exceeded.
ALTER TABLE "organization_join_codes"
  ADD CONSTRAINT "organization_join_codes_usage_check"
  CHECK (
    "use_count" >= 0
    AND ("max_uses" IS NULL OR ("max_uses" > 0 AND "use_count" <= "max_uses"))
  );
