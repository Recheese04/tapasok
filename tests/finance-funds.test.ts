import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { cancelFundAction, decideFundAction, editFundAction, recordFundAction, reverseFundAction } from "@/features/finance/actions";
import { decideFund, fundSummary, periodReport, recordFund, reverseFund, todayManila } from "@/features/finance/funds";
import { recordPaymentAction, verifyPaymentAction } from "@/features/fees/actions";
import { ForbiddenError } from "@/lib/permissions";
import { db, form, signInAs } from "./helpers/db";
import { makeWorld } from "./helpers/world";

type W = Awaited<ReturnType<typeof makeWorld>>;
const today = todayManila();
const D = (s: string) => new Prisma.Decimal(s);

/** Org A: one ₱500 fee for the member, ₱300 of it confirmed (cash) and ₱100 pending (GCash). */
async function setup(): Promise<{ w: W; feeId: string; pendingId: string }> {
  const w = await makeWorld();
  const ft = await db.feeType.create({ data: { organizationId: w.orgA.id, name: "Dues", amount: 500 } });
  const fee = await db.studentFee.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, feeTypeId: ft.id, title: "Dues", amountDue: 500 } });
  await signInAs(w.a.TREASURER.id);
  expect((await recordPaymentAction({}, form({ studentFeeId: fee.id, amount: "300", method: "CASH", reference: "" }))).error).toBeUndefined();
  const pending = await db.payment.create({ data: { studentFeeId: fee.id, amount: 100, method: "GCASH", status: "PENDING", receiptCode: "TPK-P-1", reference: "R1" } });
  return { w, feeId: fee.id, pendingId: pending.id };
}

const expense = (orgId: string, over: Record<string, string> = {}) =>
  form({ organizationId: orgId, type: "EXPENSE", requestId: randomUUID(), title: "Tarpaulin", amount: "120", category: "PRINTING", occurredOn: today, purpose: "Foundation Day banner", notes: "", ...over });

async function record(w: W, over: Record<string, string> = {}) {
  await signInAs(w.a.TREASURER.id);
  const res = await recordFundAction({}, expense(w.orgA.id, over));
  expect(res.error).toBeUndefined();
  return res.id!;
}
const decide = async (w: W, id: string, decision: "approve" | "reject", reason = "") => {
  await signInAs(w.a.PRESIDENT.id);
  return decideFundAction({}, form({ fundId: id, decision, reason }));
};
const summary = (w: W) => fundSummary(w.orgA.id);

describe("organization expenses and the available balance", () => {
  it("only confirmed payments count as collected; a pending expense changes nothing; approval deducts exactly once", async () => {
    const { w } = await setup();
    expect(await summary(w)).toMatchObject({ collected: "300.00", expenses: "0.00", available: "300.00" }); // the ₱100 pending payment is not money held
    const id = await record(w);
    expect(await summary(w)).toMatchObject({ available: "300.00", pendingExpenses: "120.00", pendingExpenseCount: 1 });
    expect((await decide(w, id, "approve")).success).toMatch(/180\.00/);
    expect(await summary(w)).toMatchObject({ expenses: "120.00", available: "180.00", pendingExpenseCount: 0 });
    // approving again (double click, two tabs, replay) cannot deduct twice
    expect((await decide(w, id, "approve")).error).toMatch(/already decided/);
    await signInAs(w.a.PRESIDENT.id);
    const results = await Promise.all([decideFund(w.a.PRESIDENT.id, id, true, null), decideFund(w.a.PRESIDENT.id, id, true, null)]);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect((await summary(w)).available).toBe("180.00");
  });

  it("concurrent approvals can never overdraw: two ₱200 expenses against ₱300 available, only one is approved", async () => {
    const { w } = await setup();
    const a = await record(w, { amount: "200", title: "Sound system" });
    const b = await record(w, { amount: "200", title: "Lights" });
    const [ra, rb] = await Promise.all([decideFund(w.a.PRESIDENT.id, a, true, null), decideFund(w.a.PRESIDENT.id, b, true, null)]);
    expect([ra.ok, rb.ok].filter(Boolean)).toHaveLength(1);
    expect([ra, rb].find((r) => !r.ok)).toMatchObject({ error: expect.stringMatching(/Not enough funds/) });
    expect(await summary(w)).toMatchObject({ expenses: "200.00", available: "100.00" });
  });

  it("rejected and cancelled expenses never count; a reversal restores the balance through a traceable record", async () => {
    const { w } = await setup();
    const r1 = await record(w, { amount: "50" });
    expect((await decide(w, r1, "reject")).error).toMatch(/reason/); // reason required
    expect((await decide(w, r1, "reject", "No official receipt")).success).toBe("Rejected.");
    const r2 = await record(w, { amount: "70" });
    await signInAs(w.a.TREASURER.id);
    expect((await cancelFundAction({}, form({ fundId: r2, reason: "Bought with personal money" }))).success).toBe("Cancelled.");
    expect((await decide(w, r2, "approve")).error).toMatch(/already decided/);
    expect((await summary(w)).available).toBe("300.00");

    const r3 = await record(w, { amount: "100" });
    await decide(w, r3, "approve");
    expect((await summary(w)).available).toBe("200.00");
    await signInAs(w.a.PRESIDENT.id);
    expect((await reverseFundAction({}, form({ fundId: r3, reason: "Supplier refunded the full amount" }))).success).toMatch(/300\.00/);
    expect((await reverseFundAction({}, form({ fundId: r3, reason: "again" }))).error).toMatch(/Only approved/);
    expect((await summary(w)).available).toBe("300.00");
    const row = await db.fundTransaction.findUniqueOrThrow({ where: { id: r3 } });
    expect(row).toMatchObject({ status: "REVERSED", reversalReason: "Supplier refunded the full amount", reversedById: w.a.PRESIDENT.id });
    expect(await db.fundTransaction.count()).toBe(3); // nothing deleted
  });

  it("other funds (opening balance, donations) count once approved; reversing income that was already spent is refused", async () => {
    const { w } = await setup();
    const inc = await record(w, { type: "INCOME", category: "OPENING_BALANCE", title: "Cash on hand from last term", amount: "1000" });
    expect((await summary(w)).available).toBe("300.00");
    await decide(w, inc, "approve");
    expect(await summary(w)).toMatchObject({ otherIncome: "1000.00", available: "1300.00" });
    const big = await record(w, { amount: "1200", title: "Venue rental", category: "VENUE" });
    await decide(w, big, "approve");
    expect((await summary(w)).available).toBe("100.00");
    expect(await reverseFund(w.a.PRESIDENT.id, inc, "Wrong amount")).toMatchObject({ ok: false, error: expect.stringMatching(/negative/) });
    // category must match the type
    await signInAs(w.a.TREASURER.id);
    expect((await recordFundAction({}, expense(w.orgA.id, { type: "INCOME", category: "PRINTING" }))).error).toMatch(/category/);
  });

  it("validates amounts, dates and text on the server, and a double-submitted form creates one record", async () => {
    const { w } = await setup();
    await signInAs(w.a.TREASURER.id);
    for (const [over, msg] of [
      [{ amount: "0" }, /greater than zero|amount like/], [{ amount: "-5" }, /amount like/], [{ amount: "12.345" }, /amount like/], [{ amount: "abc" }, /amount like/],
      [{ occurredOn: "2999-01-01" }, /future/], [{ occurredOn: "not-a-date" }, /valid date/], [{ title: "x" }, /description/], [{ purpose: "" }, /purpose/],
      [{ category: "HACK" }, /category/],
    ] as const) {
      expect((await recordFundAction({}, expense(w.orgA.id, over as Record<string, string>))).error, JSON.stringify(over)).toMatch(msg);
    }
    const f = expense(w.orgA.id);
    const [x, y] = await Promise.all([recordFundAction({}, f), recordFundAction({}, f)]);
    expect(x.id).toBe(y.id);
    expect(await db.fundTransaction.count()).toBe(1);
  });

  it("one organization's records never touch another's balance", async () => {
    const { w } = await setup();
    const id = await record(w, { amount: "100" });
    await decide(w, id, "approve");
    expect((await fundSummary(w.orgB.id)).available).toBe("0.00");
    // Org B's president cannot decide on Org A's records, even by calling the action with Org A's record id
    const id2 = await record(w, { amount: "10" });
    await signInAs(w.presidentB.id);
    await expect(decideFundAction({}, form({ fundId: id2, decision: "approve", reason: "" }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(recordFundAction({}, expense(w.orgA.id))).rejects.toBeInstanceOf(ForbiddenError);
    expect((await summary(w)).available).toBe("200.00");
  });
});

describe("expense permissions", () => {
  it("Treasurer records, President approves; nobody else can, and nobody approves their own record", async () => {
    const { w } = await setup();
    for (const role of ["PRESIDENT", "SECRETARY", "AUDITOR", "OFFICER", "ADVISER", "MEMBER"] as const) {
      await signInAs(w.a[role].id);
      await expect(recordFundAction({}, expense(w.orgA.id)), role).rejects.toBeInstanceOf(ForbiddenError);
    }
    const id = await record(w);
    for (const role of ["TREASURER", "SECRETARY", "AUDITOR", "OFFICER", "ADVISER", "MEMBER"] as const) {
      await signInAs(w.a[role].id);
      await expect(decideFundAction({}, form({ fundId: id, decision: "approve", reason: "" })), role).rejects.toBeInstanceOf(ForbiddenError);
      await expect(reverseFundAction({}, form({ fundId: id, reason: "nope nope" })), role).rejects.toBeInstanceOf(ForbiddenError);
    }
    // independent approval holds at the service layer and in the database itself
    expect(await decideFund(w.a.TREASURER.id, id, true, null)).toMatchObject({ ok: false, error: expect.stringMatching(/someone else/) });
    await expect(db.fundTransaction.update({ where: { id }, data: { status: "APPROVED", decidedById: w.a.TREASURER.id } })).rejects.toThrow(/independent_decision/);
    // a President who is also recorded as the recorder (e.g. records via the service) cannot approve it
    const own = await recordFund(w.a.PRESIDENT.id, w.orgA.id, { type: "EXPENSE", title: "Snacks", amount: D("10"), category: "FOOD", occurredOn: today, purpose: "Meeting", notes: null, requestId: randomUUID() });
    if (!own.ok) throw new Error(own.error);
    expect(await decideFund(w.a.PRESIDENT.id, own.id, true, null)).toMatchObject({ ok: false });
    expect((await summary(w)).available).toBe("300.00");
  });

  it("only the recorder can edit or cancel, and only while pending", async () => {
    const { w } = await setup();
    const id = await record(w);
    await signInAs(w.a.TREASURER.id);
    expect((await editFundAction({}, form({ fundId: id, title: "Tarpaulin 3x6", amount: "150", category: "PRINTING", occurredOn: today, purpose: "Foundation Day banner", notes: "" }))).success).toBe("Saved.");
    await decide(w, id, "approve");
    await signInAs(w.a.TREASURER.id);
    expect((await editFundAction({}, form({ fundId: id, title: "Tarpaulin", amount: "1", category: "PRINTING", occurredOn: today, purpose: "x x x", notes: "" }))).error).toMatch(/Only pending/);
    expect((await cancelFundAction({}, form({ fundId: id, reason: "changed mind" }))).error).toMatch(/Only pending/);
    expect((await summary(w)).expenses).toBe("150.00");
  });
});

describe("financial audit trail", () => {
  it("records every financial action with actor, amount, before/after and reason", async () => {
    const { w, pendingId } = await setup();
    await signInAs(w.a.TREASURER.id);
    await verifyPaymentAction(form({ paymentId: pendingId, decision: "approve" }));
    const id = await record(w);
    await signInAs(w.a.TREASURER.id);
    await editFundAction({}, form({ fundId: id, title: "Tarpaulin", amount: "130", category: "PRINTING", occurredOn: today, purpose: "Foundation Day banner", notes: "" }));
    await decide(w, id, "approve");
    await signInAs(w.a.PRESIDENT.id);
    await reverseFundAction({}, form({ fundId: id, reason: "Duplicate of a receipt already paid" }));

    const log = await db.financialAuditEntry.findMany({ where: { organizationId: w.orgA.id }, orderBy: { createdAt: "asc" } });
    expect(log.map((e) => e.action)).toEqual(["payment.record", "payment.confirm", "expense.record", "expense.edit", "expense.approve", "expense.reverse"]);
    const edit = log.find((e) => e.action === "expense.edit")!;
    expect(edit).toMatchObject({ actorId: w.a.TREASURER.id, entityId: id });
    expect((edit.before as { amount: string }).amount).toBe("120.00");
    expect((edit.after as { amount: string }).amount).toBe("130.00");
    const rev = log.find((e) => e.action === "expense.reverse")!;
    expect(rev).toMatchObject({ actorId: w.a.PRESIDENT.id, reason: "Duplicate of a receipt already paid" });
    expect(rev.amount?.toFixed(2)).toBe("130.00");
    expect(await db.financialAuditEntry.count({ where: { organizationId: w.orgB.id } })).toBe(0);
  });

  it("is append-only: the database refuses to change or delete an entry", async () => {
    const { w } = await setup();
    const entry = await db.financialAuditEntry.findFirstOrThrow({ where: { organizationId: w.orgA.id } });
    await expect(db.financialAuditEntry.update({ where: { id: entry.id }, data: { amount: "1.00" } })).rejects.toThrow(/append-only/);
    await expect(db.financialAuditEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/);
    await expect(db.financialAuditEntry.deleteMany({ where: { organizationId: w.orgA.id } })).rejects.toThrow(/append-only/);
    expect(await db.financialAuditEntry.count({ where: { id: entry.id } })).toBe(1);
  });
});

describe("period report", () => {
  it("opening + received − spent = closing, and it reconciles with the balance computed directly", async () => {
    const { w } = await setup();
    const old = "2026-01-15";
    const inc = await record(w, { type: "INCOME", category: "DONATION", title: "Alumni donation", amount: "500", occurredOn: old });
    await decide(w, inc, "approve");
    const e1 = await record(w, { amount: "80", occurredOn: old, title: "Old supplies", category: "SUPPLIES" });
    await decide(w, e1, "approve");
    const e2 = await record(w, { amount: "120" });
    await decide(w, e2, "approve");
    const pend = await record(w, { amount: "999" }); // pending: never in the report
    void pend;

    const r = await periodReport(w.orgA.id, `${today.slice(0, 7)}-01`, today);
    expect(r).toMatchObject({ opening: "420.00", collections: "300.00", otherIncome: "0.00", received: "300.00", spent: "120.00", closing: "600.00", reconciles: true });
    expect(r.categories).toEqual([{ type: "EXPENSE", category: "PRINTING", label: "Printing", amount: "120.00", count: 1 }]);
    expect((await summary(w)).available).toBe(r.closing);
    const jan = await periodReport(w.orgA.id, "2026-01-01", "2026-01-31");
    expect(jan).toMatchObject({ opening: "0.00", received: "500.00", spent: "80.00", closing: "420.00", reconciles: true });
  });
});
