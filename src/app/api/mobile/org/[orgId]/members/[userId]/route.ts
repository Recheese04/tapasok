import { z } from "zod";
import { db } from "@/lib/database/client";
import { ledger } from "@/features/fees/ledger";
import { fail, json } from "@/lib/mobile/api";
import { money } from "@/lib/mobile/queries";
import { capabilitiesIn, orgAuthed } from "@/lib/mobile/org";
import { Prisma } from "@/generated/prisma/client";

/**
 * One member's record in this organization, for officers (members.basic). Each block follows the same capability as the
 * web: attendance with attendance.view_org, fees with fees.view_org, obligations with obligations.view_org, email with
 * members.roster. Only this organization's events, fees and obligations are counted, never the member's other organizations.
 */
export const GET = orgAuthed<{ params: Promise<{ orgId: string; userId: string }> }>("members.basic", async (user, _request, orgId, ctx) => {
  const { userId } = await ctx.params;
  if (!z.uuid().safeParse(userId).success) return fail(404, "NOT_FOUND", "Member not found.");
  const memberships = await db.organizationMember.findMany({ where: { organizationId: orgId, userId, endedAt: null }, select: { role: true, title: true, startedAt: true } });
  if (!memberships.length) return fail(404, "NOT_FOUND", "Member not found.");
  const caps = capabilitiesIn(user, orgId);

  const [u, groups, recent, fees, obligations] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true, studentProfile: { select: { studentNumber: true, yearLevel: true, program: { select: { name: true, code: true } } } } },
    }),
    caps["attendance.view_org"] ? db.attendanceRecord.groupBy({ by: ["status"], where: { userId, event: { organizationId: orgId } }, _count: { _all: true } }) : null,
    caps["attendance.view_org"] ? db.attendanceRecord.findMany({
      where: { userId, event: { organizationId: orgId } }, orderBy: { scannedAt: "desc" }, take: 10,
      select: { id: true, status: true, scannedAt: true, session: { select: { label: true } }, event: { select: { id: true, title: true } } },
    }) : null,
    caps["fees.view_org"] ? db.studentFee.findMany({
      where: { userId, organizationId: orgId }, orderBy: { createdAt: "desc" },
      select: { id: true, title: true, amountDue: true, adjustments: { select: { amount: true } }, payments: { select: { amount: true, status: true, voidedAt: true } } },
    }) : null,
    caps["obligations.view_org"] ? db.obligation.findMany({ where: { userId, organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, title: true, status: true, dueAt: true } }) : null,
  ]);

  let attendance = null;
  if (groups && recent) {
    const c = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 } as Record<string, number>;
    for (const g of groups) c[g.status] = g._count._all;
    const counted = c.PRESENT + c.LATE + c.ABSENT; // excused sessions do not count against the member
    attendance = {
      counts: c,
      rate: counted ? Math.round(((c.PRESENT + c.LATE) / counted) * 100) : null,
      onTimeRate: c.PRESENT + c.LATE ? Math.round((c.PRESENT / (c.PRESENT + c.LATE)) * 100) : null,
      recent: recent.map((r) => ({ id: r.id, status: r.status, at: r.scannedAt.toISOString(), session: r.session.label, event: r.event.title, eventId: r.event.id })),
    };
  }

  let finance = null;
  if (fees) {
    let due = new Prisma.Decimal(0), paid = new Prisma.Decimal(0), pending = new Prisma.Decimal(0), balance = new Prisma.Decimal(0);
    const rows = fees.map((f) => {
      const l = ledger(f);
      due = due.add(l.effectiveDue); paid = paid.add(l.paid); pending = pending.add(l.pending);
      if (l.balance.gt(0)) balance = balance.add(l.balance);
      return { id: f.id, title: f.title, due: money(l.effectiveDue), paid: money(l.paid), balance: money(l.balance), status: l.status };
    });
    finance = { due: money(due), paid: money(paid), pending: money(pending), balance: money(balance), fees: rows };
  }

  return json({
    userId, name: `${u.firstName} ${u.lastName}`,
    email: caps["members.roster"] ? u.email : undefined,
    studentNumber: u.studentProfile?.studentNumber ?? null, yearLevel: u.studentProfile?.yearLevel ?? null, program: u.studentProfile?.program?.name ?? null,
    positions: memberships.map((m) => ({ role: m.role, title: m.title })),
    memberSince: memberships.reduce((a, m) => (m.startedAt < a ? m.startedAt : a), memberships[0].startedAt).toISOString(),
    attendance,
    finance,
    obligations: obligations && obligations.map((o) => ({ id: o.id, title: o.title, status: o.status, dueAt: o.dueAt?.toISOString() ?? null })),
  });
});
