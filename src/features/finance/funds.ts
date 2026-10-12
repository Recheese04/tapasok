import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { FundCategory, FundTransactionType } from "@/generated/prisma/enums";
import { db } from "@/lib/database/client";
import { finAudit } from "./audit";

// Organization funds: money spent (expenses) and money received other than member fees (opening balance, donations,
// sponsorships). The available balance is never stored; it is always derived from records:
//
//   available = confirmed, non-voided fee payments + approved other income − approved expenses
//
// Pending, rejected, cancelled and reversed records never count. Every change runs in a transaction that also writes
// the financial audit entry; decisions take a per-organization lock so two approvals can never overdraw the funds.
// Callers authorize the actor's capability in the organization first (expenses.record / expenses.approve).

type Tx = Prisma.TransactionClient | typeof db;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const ZERO = () => new Prisma.Decimal(0);
const money = (d: Prisma.Decimal) => d.toFixed(2);

export const EXPENSE_CATEGORIES = ["SUPPLIES", "EVENT_MATERIALS", "PRINTING", "TRANSPORTATION", "FOOD", "VENUE", "SERVICES", "OTHER"] as const satisfies readonly FundCategory[];
export const INCOME_CATEGORIES = ["OPENING_BALANCE", "DONATION", "SPONSORSHIP", "OTHER"] as const satisfies readonly FundCategory[];
export const CATEGORY_LABEL: Record<FundCategory, string> = {
  SUPPLIES: "Supplies", EVENT_MATERIALS: "Event materials", PRINTING: "Printing", TRANSPORTATION: "Transportation", FOOD: "Food",
  VENUE: "Venue", SERVICES: "Services", OPENING_BALANCE: "Opening balance", DONATION: "Donation", SPONSORSHIP: "Sponsorship", OTHER: "Other",
};
export const MAX_AMOUNT = new Prisma.Decimal("9999999.99");

// ---------------------------------------------------------------- dates (Manila calendar days)

/** "2026-10-12" → the Date stored in a DATE column for that day. */
export const dayValue = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
/** Start of a Manila calendar day, as an instant. */
const manilaStart = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`);
export const todayManila = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const addDays = (ymd: string, n: number) => { const d = dayValue(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------------------------------------------------------------- balances

export type Range = { from?: string; to?: string }; // inclusive Manila dates, YYYY-MM-DD

async function sums(client: Tx, organizationId: string, r: Range = {}) {
  const paidAt = { ...(r.from ? { gte: manilaStart(r.from) } : {}), ...(r.to ? { lt: manilaStart(addDays(r.to, 1)) } : {}) };
  const occurredOn = { ...(r.from ? { gte: dayValue(r.from) } : {}), ...(r.to ? { lte: dayValue(r.to) } : {}) };
  const fund = (type: FundTransactionType, status: "APPROVED" | "PENDING") =>
    client.fundTransaction.aggregate({ where: { organizationId, type, status, ...(r.from || r.to ? { occurredOn } : {}) }, _sum: { amount: true }, _count: { _all: true } });
  const [collected, income, expenses, pendingExpenses, pendingIncome] = await Promise.all([
    client.payment.aggregate({ where: { status: "CONFIRMED", voidedAt: null, studentFee: { organizationId }, ...(r.from || r.to ? { paidAt } : {}) }, _sum: { amount: true } }),
    fund("INCOME", "APPROVED"), fund("EXPENSE", "APPROVED"), fund("EXPENSE", "PENDING"), fund("INCOME", "PENDING"),
  ]);
  const c = collected._sum.amount ?? ZERO(), i = income._sum.amount ?? ZERO(), e = expenses._sum.amount ?? ZERO();
  return {
    collected: c, otherIncome: i, expenses: e, available: c.add(i).sub(e),
    pendingExpenses: pendingExpenses._sum.amount ?? ZERO(), pendingExpenseCount: pendingExpenses._count._all,
    pendingIncome: pendingIncome._sum.amount ?? ZERO(), pendingIncomeCount: pendingIncome._count._all,
  };
}

/** Money summary for an organization (optionally limited to a date range), as strings ready to display. */
export async function fundSummary(organizationId: string, r: Range = {}) {
  const s = await sums(db, organizationId, r);
  return {
    collected: money(s.collected), otherIncome: money(s.otherIncome), expenses: money(s.expenses), available: money(s.available),
    pendingExpenses: money(s.pendingExpenses), pendingExpenseCount: s.pendingExpenseCount, pendingIncome: money(s.pendingIncome), pendingIncomeCount: s.pendingIncomeCount,
  };
}

/**
 * Period report: opening balance (everything before `from`), money received and spent in the period, closing balance.
 * closing = opening + received − spent, and it is cross-checked against the balance computed directly up to `to`.
 */
export async function periodReport(organizationId: string, from: string, to: string) {
  const before = await sums(db, organizationId, { to: addDays(from, -1) });
  const during = await sums(db, organizationId, { from, to });
  const upTo = await sums(db, organizationId, { to });
  const received = during.collected.add(during.otherIncome);
  const closing = before.available.add(received).sub(during.expenses);
  const byCategory = await db.fundTransaction.groupBy({
    by: ["type", "category"], where: { organizationId, status: "APPROVED", occurredOn: { gte: dayValue(from), lte: dayValue(to) } }, _sum: { amount: true }, _count: { _all: true },
  });
  return {
    from, to,
    opening: money(before.available),
    collections: money(during.collected), otherIncome: money(during.otherIncome), received: money(received),
    spent: money(during.expenses), closing: money(closing),
    reconciles: closing.equals(upTo.available),
    categories: byCategory.map((g) => ({ type: g.type, category: g.category, label: CATEGORY_LABEL[g.category], amount: money(g._sum.amount ?? ZERO()), count: g._count._all }))
      .sort((a, b) => Number(b.amount) - Number(a.amount)),
  };
}

// ---------------------------------------------------------------- recording and deciding

export type FundInput = {
  type: FundTransactionType; title: string; amount: Prisma.Decimal; category: FundCategory; occurredOn: string; purpose: string; notes: string | null;
  requestId: string; receipt?: { key: string; mime: string; name: string } | null;
};

function validate(i: FundInput): string | null {
  if (i.amount.lte(0)) return "The amount must be greater than zero.";
  if (i.amount.gt(MAX_AMOUNT)) return "The amount is too large.";
  if (i.amount.decimalPlaces() > 2) return "Use at most two decimal places.";
  const allowed: readonly FundCategory[] = i.type === "EXPENSE" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  if (!allowed.includes(i.category)) return "Choose a category for this kind of record.";
  if (!isYmd(i.occurredOn)) return "Enter a valid date.";
  if (i.occurredOn > todayManila()) return "The date cannot be in the future.";
  if (i.occurredOn < "2000-01-01") return "Enter a valid date.";
  if (i.title.trim().length < 3) return "Enter a short description (at least 3 characters).";
  if (i.purpose.trim().length < 3) return "Enter the purpose or reason.";
  return null;
}

const snapshot = (t: { title: string; amount: Prisma.Decimal; category: FundCategory; occurredOn: Date; purpose: string; notes: string | null; status: string }) => ({
  title: t.title, amount: money(t.amount), category: t.category, occurredOn: t.occurredOn.toISOString().slice(0, 10), purpose: t.purpose, notes: t.notes, status: t.status,
});

/** Records an expense or other income as PENDING. A repeated request (same requestId, e.g. a double click) returns the first record. */
export async function recordFund(actorId: string, organizationId: string, input: FundInput): Promise<Result<{ id: string; duplicate: boolean }>> {
  const err = validate(input);
  if (err) return { ok: false, error: err };
  const existing = await db.fundTransaction.findUnique({ where: { requestId: input.requestId }, select: { id: true, organizationId: true, recordedById: true } });
  if (existing) return existing.organizationId === organizationId && existing.recordedById === actorId ? { ok: true, id: existing.id, duplicate: true } : { ok: false, error: "This form was already submitted." };
  try {
    const t = await db.$transaction(async (tx) => {
      const row = await tx.fundTransaction.create({
        data: {
          organizationId, type: input.type, title: input.title.trim().slice(0, 150), amount: input.amount, category: input.category, occurredOn: dayValue(input.occurredOn),
          purpose: input.purpose.trim().slice(0, 500), notes: input.notes?.trim().slice(0, 1000) || null, requestId: input.requestId, recordedById: actorId,
          receiptKey: input.receipt?.key ?? null, receiptMime: input.receipt?.mime ?? null, receiptName: input.receipt?.name.slice(0, 200) ?? null,
        },
      });
      await finAudit(tx, { organizationId, action: `${input.type === "EXPENSE" ? "expense" : "income"}.record`, entityType: "fund_transaction", entityId: row.id, amount: row.amount, actorId, after: { ...snapshot(row), receipt: !!row.receiptKey } });
      return row;
    });
    return { ok: true, id: t.id, duplicate: false };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.fundTransaction.findUnique({ where: { requestId: input.requestId }, select: { id: true } });
      if (again) return { ok: true, id: again.id, duplicate: true };
    }
    throw e;
  }
}

async function lockOrg(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
}

const label = (type: FundTransactionType) => (type === "EXPENSE" ? "expense" : "income");

/** Edits a PENDING record. Only the person who recorded it, and only before a decision. Old and new values are audited. */
export async function editFund(actorId: string, id: string, input: Omit<FundInput, "requestId" | "type">): Promise<Result> {
  const t = await db.fundTransaction.findUnique({ where: { id } });
  if (!t) return { ok: false, error: "Record not found." };
  if (t.recordedById !== actorId) return { ok: false, error: "Only the person who recorded this can edit it." };
  const err = validate({ ...input, type: t.type, requestId: "x" });
  if (err) return { ok: false, error: err };
  return db.$transaction(async (tx) => {
    await lockOrg(tx, t.organizationId);
    const { count } = await tx.fundTransaction.updateMany({
      where: { id, status: "PENDING" },
      data: {
        title: input.title.trim().slice(0, 150), amount: input.amount, category: input.category, occurredOn: dayValue(input.occurredOn), purpose: input.purpose.trim().slice(0, 500), notes: input.notes?.trim().slice(0, 1000) || null,
        ...(input.receipt ? { receiptKey: input.receipt.key, receiptMime: input.receipt.mime, receiptName: input.receipt.name.slice(0, 200) } : {}),
      },
    });
    if (!count) return { ok: false as const, error: "Only pending records can be edited." };
    const after = await tx.fundTransaction.findUniqueOrThrow({ where: { id } });
    await finAudit(tx, { organizationId: t.organizationId, action: `${label(t.type)}.edit`, entityType: "fund_transaction", entityId: id, amount: after.amount, actorId, before: snapshot(t), after: snapshot(after) });
    return { ok: true as const };
  });
}

/** Withdraws a PENDING record (by the person who recorded it). Kept for history; never counted. */
export async function cancelFund(actorId: string, id: string, reason: string): Promise<Result> {
  if (reason.trim().length < 3) return { ok: false, error: "Enter the reason for cancelling." };
  const t = await db.fundTransaction.findUnique({ where: { id } });
  if (!t) return { ok: false, error: "Record not found." };
  if (t.recordedById !== actorId) return { ok: false, error: "Only the person who recorded this can cancel it." };
  return db.$transaction(async (tx) => {
    const { count } = await tx.fundTransaction.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED", decisionReason: reason.trim().slice(0, 500), decidedAt: new Date() } });
    if (!count) return { ok: false as const, error: "Only pending records can be cancelled." };
    await finAudit(tx, { organizationId: t.organizationId, action: `${label(t.type)}.cancel`, entityType: "fund_transaction", entityId: id, amount: t.amount, actorId, before: { status: "PENDING" }, after: { status: "CANCELLED" }, reason });
    return { ok: true as const };
  });
}

/**
 * Approves or rejects a PENDING record. The decider can never be the recorder. Approving an expense that is larger than
 * the available balance is refused. The organization lock + conditional update make a record count exactly once.
 */
export async function decideFund(actorId: string, id: string, approve: boolean, reason: string | null): Promise<Result<{ available: string }>> {
  if (!approve && !reason?.trim()) return { ok: false, error: "Enter the reason for rejecting." };
  const t = await db.fundTransaction.findUnique({ where: { id } });
  if (!t) return { ok: false, error: "Record not found." };
  if (t.recordedById === actorId) return { ok: false, error: "You recorded this, so someone else must approve or reject it." };
  return db.$transaction(async (tx) => {
    await lockOrg(tx, t.organizationId);
    if (approve && t.type === "EXPENSE") {
      const { available } = await sums(tx, t.organizationId);
      if (t.amount.gt(available)) return { ok: false as const, error: `Not enough funds: the available balance is ₱${money(available)}.` };
    }
    const { count } = await tx.fundTransaction.updateMany({
      where: { id, status: "PENDING" },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actorId, decidedAt: new Date(), decisionReason: reason?.trim().slice(0, 500) || null },
    });
    if (!count) return { ok: false as const, error: "This record was already decided." };
    await finAudit(tx, { organizationId: t.organizationId, action: `${label(t.type)}.${approve ? "approve" : "reject"}`, entityType: "fund_transaction", entityId: id, amount: t.amount, actorId, before: { status: "PENDING" }, after: { status: approve ? "APPROVED" : "REJECTED" }, reason });
    const { available } = await sums(tx, t.organizationId);
    return { ok: true as const, available: money(available) };
  });
}

/**
 * Reverses an APPROVED record (refund received, entered by mistake, ...). The record stays with who reversed it, when
 * and why; it simply stops counting. Reversing income that the balance can no longer cover is refused.
 */
export async function reverseFund(actorId: string, id: string, reason: string): Promise<Result<{ available: string }>> {
  if (reason.trim().length < 3) return { ok: false, error: "Enter the reason for the reversal." };
  const t = await db.fundTransaction.findUnique({ where: { id } });
  if (!t) return { ok: false, error: "Record not found." };
  return db.$transaction(async (tx) => {
    await lockOrg(tx, t.organizationId);
    if (t.type === "INCOME") {
      const { available } = await sums(tx, t.organizationId);
      if (t.amount.gt(available)) return { ok: false as const, error: `Reversing this would make the balance negative (available ₱${money(available)}).` };
    }
    const { count } = await tx.fundTransaction.updateMany({
      where: { id, status: "APPROVED" },
      data: { status: "REVERSED", reversedById: actorId, reversedAt: new Date(), reversalReason: reason.trim().slice(0, 500) },
    });
    if (!count) return { ok: false as const, error: "Only approved records can be reversed." };
    await finAudit(tx, { organizationId: t.organizationId, action: `${label(t.type)}.reverse`, entityType: "fund_transaction", entityId: id, amount: t.amount, actorId, before: { status: "APPROVED" }, after: { status: "REVERSED" }, reason });
    const { available } = await sums(tx, t.organizationId);
    return { ok: true as const, available: money(available) };
  });
}

// ---------------------------------------------------------------- reading

const listSelect = {
  id: true, type: true, title: true, amount: true, category: true, occurredOn: true, purpose: true, notes: true, status: true, receiptKey: true, receiptName: true,
  decisionReason: true, decidedAt: true, reversalReason: true, reversedAt: true, createdAt: true, recordedById: true,
  recordedBy: { select: { firstName: true, lastName: true } }, decidedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.FundTransactionSelect;

export type FundFilter = Range & { type?: FundTransactionType; status?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "REVERSED"; category?: FundCategory };

export async function listFunds(organizationId: string, f: FundFilter = {}, take = 100) {
  const rows = await db.fundTransaction.findMany({
    where: {
      organizationId, ...(f.type ? { type: f.type } : {}), ...(f.status ? { status: f.status } : {}), ...(f.category ? { category: f.category } : {}),
      ...(f.from || f.to ? { occurredOn: { ...(f.from ? { gte: dayValue(f.from) } : {}), ...(f.to ? { lte: dayValue(f.to) } : {}) } } : {}),
    },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }], take, select: listSelect,
  });
  return rows.map((r) => ({
    id: r.id, type: r.type, title: r.title, amount: money(r.amount), category: r.category, categoryLabel: CATEGORY_LABEL[r.category], occurredOn: r.occurredOn.toISOString().slice(0, 10),
    purpose: r.purpose, notes: r.notes, status: r.status, hasReceipt: !!r.receiptKey, receiptName: r.receiptName, recordedById: r.recordedById,
    recordedBy: `${r.recordedBy.firstName} ${r.recordedBy.lastName}`, decidedBy: r.decidedBy ? `${r.decidedBy.firstName} ${r.decidedBy.lastName}` : null,
    decidedAt: r.decidedAt?.toISOString() ?? null, decisionReason: r.decisionReason, reversedAt: r.reversedAt?.toISOString() ?? null, reversalReason: r.reversalReason, createdAt: r.createdAt.toISOString(),
  }));
}

export async function listAudit(organizationId: string, f: Range & { entityType?: string; action?: string } = {}, take = 200) {
  const rows = await db.financialAuditEntry.findMany({
    where: {
      organizationId, ...(f.entityType ? { entityType: f.entityType } : {}), ...(f.action ? { action: { startsWith: f.action } } : {}),
      ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: manilaStart(f.from) } : {}), ...(f.to ? { lt: manilaStart(addDays(f.to, 1)) } : {}) } } : {}),
    },
    orderBy: { createdAt: "desc" }, take,
    include: { actor: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((r) => ({
    id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, amount: r.amount ? money(r.amount) : null,
    actor: r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : "System", at: r.createdAt.toISOString(), before: r.before, after: r.after, reason: r.reason,
  }));
}
