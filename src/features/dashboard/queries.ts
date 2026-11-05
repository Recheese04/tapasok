import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { orgIdsWith } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/dal";
import { getActiveTerm } from "@/features/academic/service";

export async function adminDashboard() {
  const [users, students, organizations, awaitingSetup, disabled, noAdviser, term] = await Promise.all([
    db.user.count(), db.studentProfile.count(), db.organization.count({ where: { status: "ACTIVE" } }),
    db.user.count({ where: { status: "INVITED" } }), db.user.count({ where: { status: "DISABLED" } }),
    db.organization.count({ where: { status: "ACTIVE", members: { none: { role: "ADVISER", endedAt: null } } } }),
    getActiveTerm(),
  ]);
  const [active, recent] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE" } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, createdAt: true, actor: { select: { firstName: true, lastName: true } } } }),
  ]);
  return { users, students, organizations, awaitingSetup, disabled, noAdviser, term, active, recent };
}

/** Every number is scoped to the organizations where the user holds the relevant permission. */
export async function memberDashboard(user: AuthUser) {
  const now = new Date();
  const viewIds = orgIdsWith(user, "events.view");
  const manageEvents = orgIdsWith(user, "events.manage");

  const attendanceGroups = await db.attendanceRecord.groupBy({ by: ["status"], where: { userId: user.id }, _count: { _all: true } });
  const attendanceByStatus = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 } as Record<"PRESENT" | "LATE" | "ABSENT" | "EXCUSED", number>;
  for (const g of attendanceGroups) attendanceByStatus[g.status] = g._count._all;

  const [upcoming, attended, openEvals, pendingMine, myFees, announcements] = await Promise.all([
    db.event.findMany({
      where: { organizationId: { in: viewIds }, endsAt: { gte: now }, deletedAt: null, OR: [{ status: "PUBLISHED" }, { organizationId: { in: manageEvents }, status: "DRAFT" }] },
      orderBy: { startsAt: "asc" }, take: 5, select: { id: true, title: true, startsAt: true, venue: true, status: true, organization: { select: { name: true } } },
    }),
    db.attendanceRecord.count({ where: { userId: user.id } }),
    db.evaluationForm.count({
      where: { status: "OPEN", organizationId: { in: viewIds }, responses: { none: { userId: user.id } }, event: { attendance: { some: { userId: user.id } } } },
    }),
    db.consequence.count({ where: { userId: user.id, status: "PENDING" } }),
    db.studentFee.findMany({ where: { userId: user.id }, select: { amountDue: true, payments: { where: { voidedAt: null, status: "CONFIRMED" }, select: { amount: true } } } }),
    db.announcement.findMany({
      where: { organizationId: { in: orgIdsWith(user, "announcements.view") }, status: "PUBLISHED", deletedAt: null },
      orderBy: { publishedAt: "desc" }, take: 3, select: { id: true, title: true, publishedAt: true, organization: { select: { name: true } } },
    }),
  ]);
  const outstanding = myFees.reduce((s, f) => f.payments.reduce((t, p) => t.sub(p.amount), s.add(f.amountDue)), new Prisma.Decimal(0));

  // Management numbers, only for organizations where the user's role allows seeing them.
  const rosterIds = orgIdsWith(user, "members.basic");
  const consIds = orgIdsWith(user, "consequences.view_org");
  const feeIds = orgIdsWith(user, "fees.view_org");
  const scanIds = orgIdsWith(user, "attendance.scan");
  const startOfDay = new Date(now); startOfDay.setUTCHours(-8, 0, 0, 0); // Manila midnight
  if (startOfDay > now) startOfDay.setUTCDate(startOfDay.getUTCDate() - 1);

  const attendanceViewIds = orgIdsWith(user, "attendance.view_org");
  const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5, 1); sixMonthsAgo.setHours(0, 0, 0, 0);

  const [members, pendingOrg, feeRows, scansToday, checkinRows] = await Promise.all([
    rosterIds.length ? db.organizationMember.count({ where: { organizationId: { in: rosterIds }, endedAt: null } }) : null,
    consIds.length ? db.consequence.count({ where: { organizationId: { in: consIds }, status: "PENDING" } }) : null,
    feeIds.length ? db.studentFee.findMany({ where: { feeType: { organizationId: { in: feeIds } } }, select: { amountDue: true, payments: { where: { voidedAt: null, status: "CONFIRMED" }, select: { amount: true } } } }) : null,
    scanIds.length ? db.attendanceRecord.count({ where: { scannedById: user.id, scannedAt: { gte: startOfDay } } }) : null,
    attendanceViewIds.length ? db.attendanceRecord.findMany({ where: { event: { organizationId: { in: attendanceViewIds } }, scannedAt: { gte: sixMonthsAgo } }, select: { scannedAt: true }, take: 50_000 }) : null,
  ]);
  // Check-ins per month for the last six months (Manila time).
  const monthKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(d);
  const checkinsByMonth = checkinRows ? Array.from({ length: 6 }, (_, i) => {
    const d = new Date(sixMonthsAgo); d.setMonth(sixMonthsAgo.getMonth() + i);
    const key = monthKey(d);
    return { label: new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "Asia/Manila" }).format(d), value: checkinRows.filter((r) => monthKey(r.scannedAt) === key).length };
  }) : null;
  const orgCollected = feeRows ? feeRows.reduce((s, f) => f.payments.reduce((t, p) => t.add(p.amount), s), new Prisma.Decimal(0)) : null;
  const orgOutstanding = feeRows ? feeRows.reduce((s, f) => f.payments.reduce((t, p) => t.sub(p.amount), s.add(f.amountDue)), new Prisma.Decimal(0)) : null;

  return { upcoming, attended, openEvals, pendingMine, outstanding, announcements, members, pendingOrg, orgOutstanding, scansToday, attendanceByStatus, checkinsByMonth, orgCollected };
}

/**
 * Read-only oversight lists for the Adviser's dashboard, limited to organizations where the viewer may see them:
 * attendance records that carry a reason (excuses and corrections), and the newest members with their academic details.
 */
export async function adviserOverview(user: AuthUser) {
  const attendanceIds = orgIdsWith(user, "attendance.view_org");
  const rosterIds = orgIdsWith(user, "members.basic");
  const [reasons, newest] = await Promise.all([
    attendanceIds.length ? db.attendanceRecord.findMany({
      where: { event: { organizationId: { in: attendanceIds } }, remark: { not: null } },
      orderBy: [{ modifiedAt: { sort: "desc", nulls: "last" } }, { scannedAt: "desc" }], take: 6,
      select: {
        id: true, status: true, remark: true, scannedAt: true, modifiedAt: true,
        session: { select: { id: true, label: true } }, event: { select: { id: true, title: true, organization: { select: { name: true } } } },
        user: { select: { firstName: true, lastName: true, studentProfile: { select: { studentNumber: true } } } },
      },
    }) : [],
    rosterIds.length ? db.organizationMember.findMany({
      where: { organizationId: { in: rosterIds }, endedAt: null, role: { not: "ADVISER" } },
      orderBy: { startedAt: "desc" }, take: 6,
      select: {
        id: true, role: true, startedAt: true, organization: { select: { id: true, name: true } },
        user: { select: { firstName: true, lastName: true, studentProfile: { select: { studentNumber: true, yearLevel: true, course: true, program: { select: { code: true } } } } } },
      },
    }) : [],
  ]);
  return { reasons, newest };
}
