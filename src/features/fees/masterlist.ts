import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { ledger } from "./ledger";
import { termWhere, yearLevelWhere, type FinanceFilter } from "./filters";

// The organization's fee masterlist: one row per current member (Advisers are not fee payers), one column per fee
// assessed in the chosen term, plus a column for fines and other charges that have no fee type. Every amount comes from
// the ledger (amount due + adjustments - confirmed, non-voided payments), the same rules as Fees & collections.
// Only names, student numbers, year level and program are shown: no contact details.

type Dec = Prisma.Decimal;
const ZERO = () => new Prisma.Decimal(0);
export type CellStatus = "PAID" | "PARTIAL" | "UNPAID" | "CREDIT";
export type Cell = { due: Dec; paid: Dec; balance: Dec; status: CellStatus };
export type MasterlistStatus = "all" | "paid" | "balance" | "none";

const statusOf = (due: Dec, paid: Dec): CellStatus => {
  const balance = due.sub(paid);
  return balance.lt(0) ? "CREDIT" : balance.isZero() ? "PAID" : paid.gt(0) ? "PARTIAL" : "UNPAID";
};
const OTHER = "other"; // fines and charges without a fee type

export async function masterlist(organizationId: string, f: FinanceFilter, opts: { q?: string; status?: MasterlistStatus } = {}) {
  const q = (opts.q ?? "").trim().slice(0, 100);
  const members = await db.organizationMember.findMany({
    where: {
      organizationId, endedAt: null, role: { not: "ADVISER" },
      user: {
        ...yearLevelWhere(f),
        ...(q ? { OR: [
          { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } },
          { studentProfile: { studentNumber: { contains: q, mode: "insensitive" } } },
        ] } : {}),
      },
    },
    select: {
      role: true,
      user: { select: { id: true, firstName: true, lastName: true, studentProfile: { select: { studentNumber: true, yearLevel: true, course: true, program: { select: { code: true } } } } } },
    },
  });
  const userIds = members.map((m) => m.user.id);
  const fees = userIds.length ? await db.studentFee.findMany({
    where: { organizationId, userId: { in: userIds }, ...termWhere(f) },
    select: {
      userId: true, amountDue: true, feeTypeId: true, title: true, createdAt: true, semester: { select: { startsOn: true } },
      feeType: { select: { id: true, name: true, amount: true } },
      adjustments: { select: { amount: true } }, payments: { select: { amount: true, status: true, voidedAt: true } },
    },
  }) : [];

  // Columns: each fee type assessed in this view in term order (then by when it was first assessed), then
  // "Fines & other charges" if any. Assessments without a term sort last.
  const colMap = new Map<string, { key: string; label: string; amount: string | null; term: number; first: number }>();
  for (const fee of fees) {
    const key = fee.feeTypeId ?? OTHER;
    const prev = colMap.get(key);
    const t = fee.createdAt.getTime(), term = fee.semester?.startsOn.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (!prev) colMap.set(key, { key, label: fee.feeType?.name ?? "Fines & other charges", amount: fee.feeType ? fee.feeType.amount.toFixed(2) : null, term, first: t });
    else { prev.first = Math.min(prev.first, t); prev.term = Math.min(prev.term, term); }
  }
  const columns = [...colMap.values()]
    .sort((a, b) => (a.key === OTHER ? 1 : b.key === OTHER ? -1 : a.term - b.term || a.first - b.first))
    .map(({ key, label, amount }) => ({ key, label, amount }));

  // Per member and column: summed ledger amounts.
  const cells = new Map<string, Map<string, { due: Dec; paid: Dec }>>();
  for (const fee of fees) {
    const l = ledger(fee);
    const row = cells.get(fee.userId) ?? new Map();
    const key = fee.feeTypeId ?? OTHER;
    const c = row.get(key) ?? { due: ZERO(), paid: ZERO() };
    row.set(key, { due: c.due.add(l.effectiveDue), paid: c.paid.add(l.paid) });
    cells.set(fee.userId, row);
  }

  const all = members.map((m) => {
    const sp = m.user.studentProfile;
    const row = cells.get(m.user.id) ?? new Map<string, { due: Dec; paid: Dec }>();
    const byColumn: Record<string, Cell | null> = {};
    let due = ZERO(), paid = ZERO();
    for (const col of columns) {
      const c = row.get(col.key);
      if (!c) { byColumn[col.key] = null; continue; }
      byColumn[col.key] = { due: c.due, paid: c.paid, balance: c.due.sub(c.paid), status: statusOf(c.due, c.paid) };
      due = due.add(c.due); paid = paid.add(c.paid);
    }
    const assessed = row.size > 0;
    return {
      userId: m.user.id, name: `${m.user.lastName}, ${m.user.firstName}`, lastName: m.user.lastName, firstName: m.user.firstName,
      studentNumber: sp?.studentNumber ?? null, yearLevel: sp?.yearLevel ?? null, program: sp?.program?.code ?? sp?.course ?? null,
      position: m.role, cells: byColumn, due, paid, balance: due.sub(paid), status: assessed ? statusOf(due, paid) : null,
    };
  });
  const isPaid = (r: (typeof all)[number]) => r.status === "PAID" || r.status === "CREDIT";
  const hasBalance = (r: (typeof all)[number]) => r.status === "UNPAID" || r.status === "PARTIAL";
  // Counts describe everyone in the view; the status filter only narrows the rows shown.
  const counts = { members: all.length, fullyPaid: all.filter(isPaid).length, withBalance: all.filter(hasBalance).length, notAssessed: all.filter((r) => r.status === null).length };
  const status = opts.status ?? "all";
  const rows = (status === "paid" ? all.filter(isPaid) : status === "balance" ? all.filter(hasBalance) : status === "none" ? all.filter((r) => r.status === null) : all)
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  const totals = rows.reduce((t, r) => ({ due: t.due.add(r.due), paid: t.paid.add(r.paid) }), { due: ZERO(), paid: ZERO() });
  const columnTotals = Object.fromEntries(columns.map((c) => [c.key, rows.reduce((t, r) => {
    const cell = r.cells[c.key];
    return cell ? { due: t.due.add(cell.due), paid: t.paid.add(cell.paid), count: t.count + 1, paidCount: t.paidCount + (cell.balance.lte(0) ? 1 : 0) } : t;
  }, { due: ZERO(), paid: ZERO(), count: 0, paidCount: 0 })]));
  return { columns, rows, totals: { ...totals, balance: totals.due.sub(totals.paid) }, columnTotals, counts };
}
export type Masterlist = Awaited<ReturnType<typeof masterlist>>;
