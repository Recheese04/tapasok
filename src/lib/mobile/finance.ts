import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { ledger } from "@/features/fees/ledger";
import { money } from "./queries";

const ZERO = () => new Prisma.Decimal(0);

/**
 * Organization-wide finance, derived from the same ledger rules the web app uses (balance = amount due + adjustments -
 * confirmed, non-voided payments). Every assessment of the organization is included; nothing is sampled, so totals are
 * complete. "Outstanding" adds up only balances that are still owed (a credit on one account does not hide another's debt).
 */
export async function orgFinance(organizationId: string) {
  const fees = await db.studentFee.findMany({
    where: { organizationId },
    select: {
      id: true, title: true, userId: true, amountDue: true,
      user: { select: { firstName: true, lastName: true, studentProfile: { select: { studentNumber: true } } } },
      adjustments: { select: { amount: true } },
      payments: { select: { amount: true, status: true, voidedAt: true } },
    },
  });

  let assessed = ZERO(), collected = ZERO(), pending = ZERO(), outstanding = ZERO();
  const people = new Map<string, { userId: string; name: string; studentNumber: string | null; due: Prisma.Decimal; paid: Prisma.Decimal; balance: Prisma.Decimal; fees: { id: string; title: string; balance: string; pending: string }[] }>();
  for (const f of fees) {
    const l = ledger(f);
    assessed = assessed.add(l.effectiveDue);
    collected = collected.add(l.paid);
    pending = pending.add(l.pending);
    if (l.balance.gt(0)) outstanding = outstanding.add(l.balance);
    const p = people.get(f.userId) ?? { userId: f.userId, name: `${f.user.firstName} ${f.user.lastName}`, studentNumber: f.user.studentProfile?.studentNumber ?? null, due: ZERO(), paid: ZERO(), balance: ZERO(), fees: [] };
    p.due = p.due.add(l.effectiveDue);
    p.paid = p.paid.add(l.paid);
    if (l.balance.gt(0)) {
      p.balance = p.balance.add(l.balance);
      p.fees.push({ id: f.id, title: f.title, balance: money(l.balance), pending: money(l.pending) });
    }
    people.set(f.userId, p);
  }

  const owing = [...people.values()].filter((p) => p.balance.gt(0)).sort((a, b) => b.balance.cmp(a.balance));
  return {
    totals: {
      assessed: money(assessed), collected: money(collected), pendingVerification: money(pending), outstanding: money(outstanding),
      collectionRate: assessed.gt(0) ? Math.round(collected.div(assessed).mul(100).toNumber()) : null,
      assessments: fees.length, membersAssessed: people.size, membersWithBalance: owing.length,
    },
    owing: owing.slice(0, 200).map((p) => ({ userId: p.userId, name: p.name, studentNumber: p.studentNumber, due: money(p.due), paid: money(p.paid), balance: money(p.balance), fees: p.fees })),
    owingTruncated: owing.length > 200,
  };
}

const paymentSelect = {
  id: true, amount: true, method: true, status: true, reference: true, receiptCode: true, paidAt: true, createdAt: true,
  studentFee: { select: { title: true, user: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.PaymentSelect;
type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;
const shape = (p: PaymentRow) => ({
  id: p.id, amount: money(p.amount), method: p.method, status: p.status, reference: p.reference, receiptCode: p.receiptCode, at: p.createdAt.toISOString(),
  member: `${p.studentFee.user.firstName} ${p.studentFee.user.lastName}`, fee: p.studentFee.title,
});

export async function pendingPayments(organizationId: string) {
  const rows = await db.payment.findMany({ where: { status: "PENDING", voidedAt: null, studentFee: { organizationId } }, orderBy: { createdAt: "asc" }, take: 100, select: paymentSelect });
  return rows.map(shape);
}

export async function recentPayments(organizationId: string, take: number) {
  const rows = await db.payment.findMany({ where: { voidedAt: null, studentFee: { organizationId } }, orderBy: { createdAt: "desc" }, take, select: paymentSelect });
  return rows.map(shape);
}
