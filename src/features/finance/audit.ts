import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";

// The financial audit trail. Append-only (the database rejects UPDATE/DELETE on the table), timestamps come from the
// database clock, and every write happens inside the same transaction as the change it describes, so a change and its
// audit entry succeed or fail together.

type Client = Prisma.TransactionClient | typeof db;
type Money = Prisma.Decimal | string | number | null | undefined;

export type FinancialAuditInput = {
  organizationId: string;
  action: string; // e.g. "expense.approve", "payment.record"
  entityType: "fee_type" | "student_fee" | "payment" | "adjustment" | "fund_transaction" | "report";
  entityId?: string | null;
  amount?: Money;
  actorId: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  reason?: string | null;
};

export async function finAudit(client: Client, e: FinancialAuditInput) {
  await client.financialAuditEntry.create({
    data: {
      organizationId: e.organizationId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      amount: e.amount === null || e.amount === undefined ? null : String(e.amount),
      actorId: e.actorId,
      before: e.before ?? undefined,
      after: e.after ?? undefined,
      reason: e.reason?.slice(0, 500) ?? null,
    },
  });
}
