import "server-only";
import { db } from "@/lib/database/client";
import { canOrg, orgIdsWith } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/dal";
import { PAGE_SIZE } from "@/components/shared/pagination";
import { expectedAttendeeIds, isExpectedAttendee } from "./eligibility";

export function myAttendance(user: AuthUser) {
  return db.attendanceRecord.findMany({
    where: { userId: user.id },
    orderBy: { scannedAt: "desc" },
    take: 50,
    select: { status: true, source: true, scannedAt: true, session: { select: { label: true } }, event: { select: { id: true, title: true, venue: true, organization: { select: { name: true } } } } },
  });
}

/** Attendance of the organizations where the user may oversee attendance. */
export async function listOrgAttendance(user: AuthUser, opts: { eventId?: string; page: number }) {
  const orgIds = orgIdsWith(user, "attendance.view_org");
  const where = { event: { organizationId: { in: orgIds } }, ...(opts.eventId ? { eventId: opts.eventId } : {}) };
  const [total, rows, events] = await Promise.all([
    db.attendanceRecord.count({ where }),
    db.attendanceRecord.findMany({
      where, orderBy: { scannedAt: "desc" }, skip: (opts.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: {
        status: true, source: true, scannedAt: true, session: { select: { label: true } },
        user: { select: { firstName: true, lastName: true, studentProfile: { select: { studentNumber: true } } } },
        event: { select: { id: true, title: true } },
      },
    }),
    db.event.findMany({ where: { organizationId: { in: orgIds } }, orderBy: { startsAt: "desc" }, take: 100, select: { id: true, title: true } }),
  ]);
  return { total, rows, events };
}

/** Sessions the user may operate a scanner for: published events, not finalized, window not long past. */
export function scannerSessions(user: AuthUser) {
  return db.eventSession.findMany({
    where: {
      finalizedAt: null, closesAt: { gte: new Date(Date.now() - 3600_000) },
      event: { status: "PUBLISHED", organizationId: { in: orgIdsWith(user, "attendance.scan") } },
    },
    orderBy: [{ opensAt: "asc" }],
    take: 40,
    select: { id: true, label: true, active: true, opensAt: true, closesAt: true, event: { select: { title: true, venue: true, organization: { select: { name: true } } } } },
  });
}

/** One session with its expected attendees merged with what was recorded. Null when the user may not oversee it. */
export async function getSessionRoster(user: AuthUser, sessionId: string) {
  const session = await db.eventSession.findUnique({ where: { id: sessionId }, include: { event: { include: { organization: { select: { name: true } } } } } });
  if (!session || !canOrg(user, "attendance.view_org", session.event.organizationId)) return null;

  const [expectedIds, records] = await Promise.all([
    expectedAttendeeIds(session.event),
    db.attendanceRecord.findMany({ where: { sessionId }, include: { user: { select: { id: true, firstName: true, lastName: true, studentProfile: { select: { studentNumber: true } } } } } }),
  ]);
  const byUser = new Map(records.map((r) => [r.userId, r]));
  const missingIds = expectedIds.filter((id) => !byUser.has(id));
  const missing = missingIds.length
    ? await db.user.findMany({ where: { id: { in: missingIds } }, select: { id: true, firstName: true, lastName: true, studentProfile: { select: { studentNumber: true } } }, orderBy: { lastName: "asc" } })
    : [];
  const expected = new Set(expectedIds);

  return {
    session, event: session.event,
    rows: [
      ...records.map((r) => ({ userId: r.userId, name: `${r.user.lastName}, ${r.user.firstName}`, studentNumber: r.user.studentProfile?.studentNumber ?? null, record: { id: r.id, status: r.status, source: r.source, at: r.scannedAt, remark: r.remark }, expected: expected.has(r.userId) })),
      ...missing.map((u) => ({ userId: u.id, name: `${u.lastName}, ${u.firstName}`, studentNumber: u.studentProfile?.studentNumber ?? null, record: null, expected: true })),
    ].sort((a, b) => a.name.localeCompare(b.name)),
    can: {
      scan: canOrg(user, "attendance.scan", session.event.organizationId),
      manual: canOrg(user, "attendance.manual", session.event.organizationId),
      excuse: canOrg(user, "attendance.excuse", session.event.organizationId),
    },
  };
}

export type MemberSession = {
  id: string; label: string; kind: "TIME_IN" | "TIME_OUT"; opensAt: Date; closesAt: Date;
  state: "open" | "not_active" | "opens_later" | "closed" | "checked_in";
  myStatus: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" | null;
  event: { id: string; title: string; venue: string; startsAt: Date; endsAt: Date; organization: string };
};

/**
 * Sessions the signed-in member is expected to attend, for the in-app QR Scanner. A person can belong to several
 * organizations and attend several events (and sessions) on the same day, so every eligible one is listed.
 */
export async function memberSessions(user: AuthUser): Promise<MemberSession[]> {
  const orgIds = [...new Set(user.memberships.map((m) => m.organizationId))];
  if (orgIds.length === 0) return [];
  const now = new Date();
  const sessions = await db.eventSession.findMany({
    where: {
      finalizedAt: null,
      closesAt: { gte: new Date(now.getTime() - 3600_000) },
      opensAt: { lte: new Date(now.getTime() + 24 * 3600_000) },
      event: { status: "PUBLISHED", organizationId: { in: orgIds } },
    },
    orderBy: [{ opensAt: "asc" }, { position: "asc" }],
    take: 60,
    select: {
      id: true, label: true, kind: true, active: true, opensAt: true, closesAt: true,
      event: { select: { id: true, title: true, venue: true, startsAt: true, endsAt: true, organizationId: true, targetMode: true, semesterId: true, organization: { select: { name: true } } } },
      attendance: { where: { userId: user.id }, select: { status: true } },
    },
  });

  const eligible = new Map<string, boolean>();
  const out: MemberSession[] = [];
  for (const s of sessions) {
    if (!eligible.has(s.event.id)) eligible.set(s.event.id, await isExpectedAttendee(s.event, user.id));
    if (!eligible.get(s.event.id)) continue;
    const mine = s.attendance[0]?.status ?? null;
    const state: MemberSession["state"] =
      mine === "PRESENT" || mine === "LATE" ? "checked_in"
      : now < s.opensAt ? "opens_later"
      : now > s.closesAt ? "closed"
      : s.active ? "open" : "not_active";
    out.push({
      id: s.id, label: s.label, kind: s.kind, opensAt: s.opensAt, closesAt: s.closesAt, state, myStatus: mine,
      event: { id: s.event.id, title: s.event.title, venue: s.event.venue, startsAt: s.event.startsAt, endsAt: s.event.endsAt, organization: s.event.organization.name },
    });
  }
  return out;
}
