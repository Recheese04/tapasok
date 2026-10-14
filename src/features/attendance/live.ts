import "server-only";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/database/client";
import { canOrg, orgIdsWith, type PolicyUser } from "@/lib/permissions/policy";
import { formatTimeSeconds, formatDate } from "@/lib/format";
import { expectedAttendeeIds } from "./eligibility";
import { MESSAGES, type Failure } from "./service";

// The officers' live attendance monitor. Everything shown comes from saved records:
//   * check-ins are attendance_records rows (the server has saved them, so they are real);
//   * refused RFID taps are written to the audit log by the terminal endpoint (never as attendance), so the monitor can say
//     why a tap did not count. Registration taps are not logged here at all.
// Access: attendance.view_org in the session's organization (President, Secretary, Officer, and the read-only Adviser).

export type RejectCode = Failure | "no_open_session" | "several_open_sessions";

const REJECT_MESSAGE: Record<string, string> = {
  ...MESSAGES,
  unknown_card: "Unknown RFID card: not registered to a student.",
  duplicate: "Already recorded for this session.",
  no_open_session: "No attendance session is open.",
  several_open_sessions: "More than one session is open. Close the one not in use.",
  not_eligible: "Not on this event's attendee list.",
};

/** Records a refused terminal tap for the organization's live monitor. Stores only the last 4 characters of the card. */
export async function logRejectedTap(device: { id: string; name: string; organizationId: string }, code: RejectCode, cardUid: string, sessionId: string | null) {
  const profile = code === "unknown_card" ? null : await db.studentProfile.findUnique({ where: { rfidUid: cardUid }, select: { userId: true } });
  await db.auditLog.create({
    data: {
      action: "rfid.tap_rejected", targetType: "organization", targetId: device.organizationId,
      metadata: { code, deviceId: device.id, deviceName: device.name, sessionId, userId: profile?.userId ?? null, cardTail: cardUid.slice(-4) },
    },
  });
}

export type SessionState = "open" | "not_activated" | "not_started" | "ended" | "finalized" | "unpublished";

export type LiveCheckIn = {
  id: string; userId: string; name: string; studentNumber: string | null; program: string | null; yearLevel: number | null;
  status: AttendanceStatus; source: string; at: string; time: string; hasPhoto: boolean;
};
export type LiveRejection = { id: string; code: string; message: string; name: string | null; studentNumber: string | null; device: string; cardTail: string | null; at: string; time: string };

/** One session's live view, or null when it does not exist or the viewer may not see its attendance. */
export async function liveSession(viewer: PolicyUser, sessionId: string, now = new Date()) {
  const s = await db.eventSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true, label: true, active: true, opensAt: true, startsAt: true, closesAt: true, graceMinutes: true, finalizedAt: true,
      event: { select: { id: true, title: true, venue: true, status: true, organizationId: true, targetMode: true, semesterId: true, organization: { select: { name: true } } } },
    },
  });
  if (!s || !canOrg(viewer, "attendance.view_org", s.event.organizationId)) return null;
  const orgId = s.event.organizationId;

  const state: SessionState = s.event.status !== "PUBLISHED" ? "unpublished" : s.finalizedAt ? "finalized" : now > s.closesAt ? "ended" : now < s.opensAt ? "not_started" : !s.active ? "not_activated" : "open";

  // Refused taps since the session opened (at most the last 30 minutes), for this session or with no session at all.
  const since = new Date(Math.max(s.opensAt.getTime(), now.getTime() - 30 * 60_000));
  const [byStatus, recent, rejected, devices, expected] = await Promise.all([
    db.attendanceRecord.groupBy({ by: ["status"], where: { sessionId }, _count: { _all: true } }),
    db.attendanceRecord.findMany({
      where: { sessionId, status: { in: ["PRESENT", "LATE"] } }, orderBy: [{ scannedAt: "desc" }, { id: "desc" }], take: 30,
      select: {
        id: true, status: true, source: true, scannedAt: true,
        user: { select: { id: true, firstName: true, lastName: true, studentProfile: { select: { studentNumber: true, yearLevel: true, photoKey: true, program: { select: { code: true } } } } } },
      },
    }),
    db.auditLog.findMany({ where: { action: "rfid.tap_rejected", targetId: orgId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, createdAt: true, metadata: true } }),
    db.scannerDevice.findMany({ where: { organizationId: orgId, active: true }, orderBy: { name: "asc" }, select: { name: true, lastSeenAt: true } }),
    expectedAttendeeIds(s.event).then((ids) => ids.length),
  ]);

  type Meta = { code?: string; deviceName?: string; sessionId?: string | null; userId?: string | null; cardTail?: string };
  const rejections = rejected
    .map((r) => ({ r, m: (r.metadata ?? {}) as Meta }))
    .filter(({ m }) => !m.sessionId || m.sessionId === sessionId)
    .slice(0, 15);
  const people = await db.user.findMany({
    where: { id: { in: rejections.map(({ m }) => m.userId).filter((x): x is string => !!x) } },
    select: { id: true, firstName: true, lastName: true, studentProfile: { select: { studentNumber: true } } },
  });
  const person = new Map(people.map((p) => [p.id, p]));
  const count = (st: AttendanceStatus) => byStatus.find((b) => b.status === st)?._count._all ?? 0;

  return {
    session: {
      id: s.id, label: s.label, state, opensAt: s.opensAt.toISOString(), closesAt: s.closesAt.toISOString(),
      window: `${formatDate(s.opensAt)} · ${formatTimeSeconds(s.opensAt, false)} – ${formatTimeSeconds(s.closesAt, false)}`,
      lateAfter: formatTimeSeconds(new Date(s.startsAt.getTime() + s.graceMinutes * 60_000), false),
    },
    event: { id: s.event.id, title: s.event.title, venue: s.event.venue, organization: s.event.organization.name, organizationId: orgId },
    totals: { present: count("PRESENT"), late: count("LATE"), absent: count("ABSENT"), excused: count("EXCUSED"), expected },
    checkIns: recent.map((r): LiveCheckIn => ({
      id: r.id, userId: r.user.id, name: `${r.user.firstName} ${r.user.lastName}`,
      studentNumber: r.user.studentProfile?.studentNumber ?? null, program: r.user.studentProfile?.program?.code ?? null, yearLevel: r.user.studentProfile?.yearLevel ?? null,
      status: r.status, source: r.source, at: r.scannedAt.toISOString(), time: formatTimeSeconds(r.scannedAt), hasPhoto: !!r.user.studentProfile?.photoKey,
    })),
    rejections: rejections.map(({ r, m }): LiveRejection => {
      const p = m.userId ? person.get(m.userId) : undefined;
      return {
        id: r.id, code: m.code ?? "unknown", message: REJECT_MESSAGE[m.code ?? ""] ?? "The tap was not recorded.",
        name: p ? `${p.firstName} ${p.lastName}` : null, studentNumber: p?.studentProfile?.studentNumber ?? null,
        device: m.deviceName ?? "Terminal", cardTail: m.code === "unknown_card" ? (m.cardTail ?? null) : null,
        at: r.createdAt.toISOString(), time: formatTimeSeconds(r.createdAt),
      };
    }),
    terminals: devices.map((d) => ({ name: d.name, lastSeenAt: d.lastSeenAt?.toISOString() ?? null })),
    serverTime: now.toISOString(),
  };
}
export type LiveData = NonNullable<Awaited<ReturnType<typeof liveSession>>>;

/** Sessions the viewer can monitor around now: open ones first, then today's others. */
export async function monitorableSessions(viewer: PolicyUser, now = new Date()) {
  const orgIds = orgIdsWith(viewer, "attendance.view_org");
  if (!orgIds.length) return [];
  const dayStart = new Date(now.getTime() - 12 * 3600_000), dayEnd = new Date(now.getTime() + 12 * 3600_000);
  const rows = await db.eventSession.findMany({
    where: { event: { organizationId: { in: orgIds }, status: "PUBLISHED" }, finalizedAt: null, closesAt: { gte: dayStart }, opensAt: { lte: dayEnd } },
    orderBy: { opensAt: "asc" }, take: 30,
    select: { id: true, label: true, active: true, opensAt: true, closesAt: true, event: { select: { id: true, title: true, organization: { select: { name: true } } } } },
  });
  return rows
    .map((r) => ({ id: r.id, label: r.label, event: r.event.title, eventId: r.event.id, organization: r.event.organization.name, open: r.active && r.opensAt <= now && r.closesAt >= now, window: `${formatTimeSeconds(r.opensAt, false)} – ${formatTimeSeconds(r.closesAt, false)}` }))
    .sort((a, b) => Number(b.open) - Number(a.open));
}
