import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { ledger } from "@/features/fees/ledger";
import { FEE_KIND } from "@/features/fees/labels";
import { termWhere, yearLevelWhere, type FinanceFilter } from "@/features/fees/filters";
import { fundSummary } from "./funds";

// Financial report figures, all computed from the records (nothing is typed in by hand):
//   * Potential membership-fee collection per semester = (eligible members that semester) x (membership fees set for it).
//     It is a projection, shown apart from money actually collected.
//   * Charged / collected / outstanding come from the ledger: amount + adjustments - CONFIRMED, non-voided payments.
//     Pending, rejected and voided payments never count.
//   * Cash on hand = confirmed fee collections + approved other income - approved expenses (src/features/finance/funds.ts).
//     Pending, rejected, cancelled and returned fund records never count, and nothing is counted twice: a returned record
//     simply stops counting, it does not add a second movement.

type Dec = Prisma.Decimal;
const ZERO = () => new Prisma.Decimal(0);
const money = (d: Dec) => d.toFixed(2);
type Totals = { charged: Dec; collected: Dec; count: number };
const add = (t: Totals, charged: Dec, collected: Dec): Totals => ({ charged: t.charged.add(charged), collected: t.collected.add(collected), count: t.count + 1 });
const out = (t: Totals) => ({ charged: money(t.charged), collected: money(t.collected), outstanding: money(t.charged.sub(t.collected)), count: t.count });

/** Semesters in the filter (a chosen semester, a school year's semesters, or every semester), newest first. */
async function semestersFor(f: FinanceFilter) {
  return db.semester.findMany({
    where: f.sem ? { id: f.sem } : f.sy ? { schoolYearId: f.sy } : {},
    orderBy: { startsOn: "desc" },
    select: { id: true, name: true, startsOn: true, endsOn: true, active: true, schoolYear: { select: { label: true } } },
  });
}

/**
 * A. Possible membership-fee collection, per semester. Eligible members: held a non-Adviser position in the organization at
 * some point during the semester (started on or before its last day, not ended before its first day), account not
 * disabled. Membership fees are the organization's fees of the "Membership fee" kind set for that semester.
 */
export async function membershipPotential(organizationId: string, f: FinanceFilter) {
  const semesters = await semestersFor(f);
  type Row = {
    semesterId: string; label: string; active: boolean; fees: { name: string; amount: string; active: boolean }[];
    eligibleMembers: number; perMember: string; potential: string; membersCharged: number; notYetCharged: number;
    charged: string; collected: string; outstanding: string; count: number;
  };
  const rows: Row[] = [];
  for (const s of semesters) {
    const fees = await db.feeType.findMany({ where: { organizationId, semesterId: s.id, kind: "DUES" }, select: { id: true, name: true, amount: true, active: true } });
    const eligible = await db.organizationMember.findMany({
      where: {
        organizationId, role: { not: "ADVISER" }, startedAt: { lte: new Date(s.endsOn.getTime() + 86_400_000 - 1) },
        OR: [{ endedAt: null }, { endedAt: { gte: s.startsOn } }], user: { status: { not: "DISABLED" }, ...yearLevelWhere(f) },
      },
      select: { userId: true }, distinct: ["userId"],
    });
    if (!fees.length && !s.active && f.sem !== s.id) continue; // skip old semesters with no membership fee at all
    const perMember = fees.reduce((t, x) => t.add(x.amount), ZERO());
    const charges = fees.length ? await db.studentFee.findMany({
      where: { organizationId, feeTypeId: { in: fees.map((x) => x.id) }, user: yearLevelWhere(f) },
      select: { amountDue: true, adjustments: { select: { amount: true } }, payments: { select: { amount: true, status: true, voidedAt: true } } },
    }) : [];
    const t = charges.map(ledger).reduce((acc, l) => add(acc, l.effectiveDue, l.paid), { charged: ZERO(), collected: ZERO(), count: 0 });
    rows.push({
      semesterId: s.id, label: `${s.schoolYear.label} · ${s.name}`, active: s.active,
      fees: fees.map((x) => ({ name: x.name, amount: money(x.amount), active: x.active })),
      eligibleMembers: eligible.length, perMember: money(perMember), potential: money(perMember.mul(eligible.length)),
      membersCharged: charges.length, ...out(t),
      notYetCharged: Math.max(0, eligible.length * fees.length - charges.length),
    });
  }
  const sum = (k: "potential" | "charged" | "collected" | "outstanding") => money(rows.reduce((acc, r) => acc.add(r[k]), ZERO()));
  return { rows, totals: { potential: sum("potential"), charged: sum("charged"), collected: sum("collected"), outstanding: sum("outstanding") } };
}

/** C. Charged / collected / outstanding by semester, year level and fee, for the fees in the filter. */
export async function feeBreakdowns(organizationId: string, f: FinanceFilter) {
  const fees = await db.studentFee.findMany({
    where: { organizationId, ...termWhere(f), user: yearLevelWhere(f) },
    select: {
      title: true, kind: true, amountDue: true, feeTypeId: true,
      semester: { select: { id: true, name: true, startsOn: true, schoolYear: { select: { label: true } } } },
      user: { select: { studentProfile: { select: { yearLevel: true } } } },
      adjustments: { select: { amount: true } }, payments: { select: { amount: true, status: true, voidedAt: true } },
    },
  });
  const bySemester = new Map<string, Totals & { label: string; order: number }>();
  const byYear = new Map<string, Totals & { label: string; order: number }>();
  const byFee = new Map<string, Totals & { label: string; kind: string }>();
  let membership: Totals = { charged: ZERO(), collected: ZERO(), count: 0 };
  let all: Totals = { charged: ZERO(), collected: ZERO(), count: 0 };
  for (const fee of fees) {
    const l = ledger(fee);
    const semKey = fee.semester?.id ?? "none";
    const s = bySemester.get(semKey) ?? { charged: ZERO(), collected: ZERO(), count: 0, label: fee.semester ? `${fee.semester.schoolYear.label} · ${fee.semester.name}` : "No term set", order: fee.semester ? -fee.semester.startsOn.getTime() : Number.MAX_SAFE_INTEGER };
    bySemester.set(semKey, { ...s, ...add(s, l.effectiveDue, l.paid) });
    const yl = fee.user.studentProfile?.yearLevel ?? null;
    const y = byYear.get(String(yl)) ?? { charged: ZERO(), collected: ZERO(), count: 0, label: yl ? `Year ${yl}` : "No year level", order: yl ?? 99 };
    byYear.set(String(yl), { ...y, ...add(y, l.effectiveDue, l.paid) });
    const feeKey = fee.feeTypeId ?? `fine:${fee.kind}`;
    const k = byFee.get(feeKey) ?? { charged: ZERO(), collected: ZERO(), count: 0, label: fee.feeTypeId ? fee.title : "Fines", kind: FEE_KIND[fee.kind] };
    byFee.set(feeKey, { ...k, ...add(k, l.effectiveDue, l.paid) });
    if (fee.kind === "DUES") membership = add(membership, l.effectiveDue, l.paid);
    all = add(all, l.effectiveDue, l.paid);
  }
  return {
    membership: out(membership), all: out(all),
    bySemester: [...bySemester.values()].sort((a, b) => a.order - b.order).map((x) => ({ label: x.label, ...out(x) })),
    byYearLevel: [...byYear.values()].sort((a, b) => a.order - b.order).map((x) => ({ label: x.label, ...out(x) })),
    byFee: [...byFee.values()].sort((a, b) => b.charged.cmp(a.charged)).map((x) => ({ label: x.label, kind: x.kind, ...out(x) })),
  };
}

/** B. Cash on hand (all time) with the movements behind it. */
export async function cashOnHand(organizationId: string) {
  const s = await fundSummary(organizationId);
  const inflows = new Prisma.Decimal(s.collected).add(s.otherIncome);
  return { ...s, inflows: money(inflows) };
}

export type TxStatus = "confirmed" | "pending" | "rejected" | "returned";

/**
 * Transaction history: member payments and other fund records, newest first, one list. Status filter maps each kind's own
 * statuses: confirmed = CONFIRMED payments + APPROVED records; pending; rejected = REJECTED (and CANCELLED records);
 * returned = voided payments + RETURNED (REVERSED) records.
 */
export async function transactions(organizationId: string, status: TxStatus | null, take = 60) {
  const payWhere: Prisma.PaymentWhereInput = {
    studentFee: { organizationId },
    ...(status === "confirmed" ? { status: "CONFIRMED", voidedAt: null } : status === "pending" ? { status: "PENDING", voidedAt: null } : status === "rejected" ? { status: "REJECTED" } : status === "returned" ? { voidedAt: { not: null } } : {}),
  };
  const fundWhere: Prisma.FundTransactionWhereInput = {
    organizationId,
    ...(status === "confirmed" ? { status: "APPROVED" } : status === "pending" ? { status: "PENDING" } : status === "rejected" ? { status: { in: ["REJECTED", "CANCELLED"] } } : status === "returned" ? { status: "REVERSED" } : {}),
  };
  const [payments, funds] = await Promise.all([
    db.payment.findMany({
      where: payWhere, orderBy: { createdAt: "desc" }, take,
      select: { id: true, amount: true, status: true, voidedAt: true, voidReason: true, method: true, receiptCode: true, paidAt: true, createdAt: true, studentFee: { select: { title: true, user: { select: { firstName: true, lastName: true, studentProfile: { select: { studentNumber: true } } } } } } },
    }),
    db.fundTransaction.findMany({
      where: fundWhere, orderBy: { createdAt: "desc" }, take,
      select: { id: true, type: true, title: true, amount: true, status: true, occurredOn: true, createdAt: true, reversalReason: true, decisionReason: true },
    }),
  ]);
  const rows = [
    ...payments.map((p) => ({
      id: p.id, at: p.paidAt, kind: "Fee payment" as const, direction: "in" as const, amount: money(p.amount),
      title: `${p.studentFee.title} · ${p.studentFee.user.lastName}, ${p.studentFee.user.firstName}`,
      detail: [p.receiptCode, p.method.toLowerCase().replace("_", " "), p.studentFee.user.studentProfile?.studentNumber].filter(Boolean).join(" · "),
      status: (p.voidedAt ? "returned" : p.status === "CONFIRMED" ? "confirmed" : p.status === "PENDING" ? "pending" : "rejected") as TxStatus,
      note: p.voidedAt ? (p.voidReason ?? null) : null,
    })),
    ...funds.map((t) => ({
      id: t.id, at: t.occurredOn, kind: (t.type === "EXPENSE" ? "Expense" : "Other income") as "Expense" | "Other income", direction: (t.type === "EXPENSE" ? "out" : "in") as "in" | "out",
      amount: money(t.amount), title: t.title, detail: null,
      status: (t.status === "APPROVED" ? "confirmed" : t.status === "PENDING" ? "pending" : t.status === "REVERSED" ? "returned" : "rejected") as TxStatus,
      note: t.reversalReason ?? t.decisionReason ?? null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
  return rows;
}
