import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { assertSystemPermission, orgIdsWith } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/dal";
import { ledger } from "@/features/fees/ledger";

export async function systemReport() {
  await assertSystemPermission("reports.system");
  const [users, activeUsers, students, organizations, memberships, events, recent] = await Promise.all([
    db.user.count(), db.user.count({ where: { status: "ACTIVE" } }), db.studentProfile.count(),
    db.organization.count({ where: { status: "ACTIVE" } }), db.organizationMember.count({ where: { endedAt: null } }), db.event.count({ where: { deletedAt: null } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, createdAt: true, actor: { select: { firstName: true, lastName: true } } } }),
  ]);
  return { users, activeUsers, students, organizations, memberships, events, recent };
}

export async function attendanceSummary(user: AuthUser) {
  const events = await db.event.findMany({
    where: { organizationId: { in: orgIdsWith(user, "reports.attendance") }, status: "PUBLISHED", deletedAt: null },
    orderBy: { startsAt: "desc" }, take: 50,
    select: { id: true, title: true, startsAt: true, organization: { select: { name: true } }, sessions: { select: { id: true } }, attendance: { select: { status: true, userId: true } } },
  });
  return events.map((e) => {
    const n = (s: string) => e.attendance.filter((a) => a.status === s).length;
    const attendees = new Set(e.attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").map((a) => a.userId)).size;
    const expected = new Set(e.attendance.map((a) => a.userId)).size; // everyone with a record (finalized sessions include absentees)
    return { id: e.id, title: e.title, org: e.organization.name, startsAt: e.startsAt, sessions: e.sessions.length, present: n("PRESENT"), late: n("LATE"), absent: n("ABSENT"), excused: n("EXCUSED"), rate: expected ? Math.round((attendees / expected) * 100) : null };
  });
}

export async function consequenceSummary(user: AuthUser) {
  const rows = await db.consequence.groupBy({ by: ["organizationId", "status"], where: { organizationId: { in: orgIdsWith(user, "reports.consequences") } }, _count: { _all: true } });
  const orgs = await db.organization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.organizationId))] } }, select: { id: true, name: true } });
  return orgs.map((o) => {
    const n = (s: string) => rows.find((r) => r.organizationId === o.id && r.status === s)?._count._all ?? 0;
    return { org: o.name, pending: n("PENDING"), completed: n("COMPLETED"), waived: n("WAIVED") };
  });
}

export async function financeSummary(user: AuthUser) {
  const fees = await db.feeType.findMany({
    where: { organizationId: { in: orgIdsWith(user, "reports.finance") } }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, name: true, organization: { select: { name: true } }, assignments: { select: { amountDue: true, adjustments: { select: { amount: true } }, payments: { select: { amount: true, status: true, voidedAt: true } } } } },
  });
  return fees.map((f) => {
    const ls = f.assignments.map(ledger);
    const due = ls.reduce((s, l) => s.add(l.effectiveDue), new Prisma.Decimal(0));
    const collected = ls.reduce((s, l) => s.add(l.paid), new Prisma.Decimal(0));
    return { id: f.id, name: f.name, org: f.organization.name, assigned: f.assignments.length, due, collected, outstanding: due.sub(collected) };
  });
}

/** Detailed CSV rows. Each export re-checks the matching report permission. */
export async function exportRows(user: AuthUser, type: "attendance" | "finance"): Promise<unknown[][] | null> {
  if (type === "attendance") {
    const ids = orgIdsWith(user, "reports.attendance");
    if (!ids.length) return null;
    const rows = await db.attendanceRecord.findMany({
      where: { event: { organizationId: { in: ids } } }, orderBy: [{ event: { startsAt: "desc" } }, { session: { position: "asc" } }, { scannedAt: "asc" }], take: 20000,
      select: { status: true, source: true, scannedAt: true, remark: true, session: { select: { label: true } }, event: { select: { title: true, startsAt: true, organization: { select: { name: true } } } }, user: { select: { firstName: true, lastName: true, studentProfile: { select: { studentNumber: true } } } } },
    });
    return [["Organization", "Event", "Event date", "Session", "Student number", "Last name", "First name", "Status", "Source", "Recorded at", "Remark"],
      ...rows.map((r) => [r.event.organization.name, r.event.title, r.event.startsAt.toISOString(), r.session.label, r.user.studentProfile?.studentNumber ?? "", r.user.lastName, r.user.firstName, r.status, r.source, r.scannedAt.toISOString(), r.remark ?? ""])];
  }
  const ids = orgIdsWith(user, "reports.finance");
  if (!ids.length) return null;
  const rows = await db.studentFee.findMany({
    where: { organizationId: { in: ids } }, orderBy: [{ title: "asc" }, { user: { lastName: "asc" } }], take: 20000,
    select: { title: true, kind: true, amountDue: true, organization: { select: { name: true } }, user: { select: { firstName: true, lastName: true, studentProfile: { select: { studentNumber: true } } } }, adjustments: { select: { amount: true } }, payments: { select: { amount: true, status: true, voidedAt: true } } },
  });
  return [["Organization", "Obligation", "Kind", "Student number", "Last name", "First name", "Amount due", "Adjustments", "Paid (verified)", "Balance"],
    ...rows.map((r) => { const l = ledger(r); return [r.organization.name, r.title, r.kind, r.user.studentProfile?.studentNumber ?? "", r.user.lastName, r.user.firstName, r.amountDue.toFixed(2), l.adjustments.toFixed(2), l.paid.toFixed(2), l.balance.toFixed(2)]; })];
}
