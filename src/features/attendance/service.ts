import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { AttendanceSource, AttendanceStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/database/client";
import { canOrg, type PolicyUser } from "@/lib/permissions/policy";
import { calculateConsequencesForSession, reconcileConsequencesForRecord } from "@/features/consequences/auto";
import { notify } from "@/features/notifications/service";
import { expectedAttendeeIds, isExpectedAttendee } from "./eligibility";
import { verifyMemberQr, verifySessionQr } from "./qr";

// The single attendance domain service. QR, RFID, officer scans and manual entries all go through
// recordAttendance, so the same rules apply to every capture method.

export type Failure =
  | "invalid" | "expired" | "closed" | "inactive" | "finalized" | "not_found" | "not_eligible"
  | "duplicate" | "unknown_card" | "forbidden" | "revoked" | "wrong_session";

export const MESSAGES: Record<Failure, string> = {
  invalid: "Invalid code.",
  expired: "This QR code has expired. Scan the current code.",
  closed: "Attendance is not open for this session right now.",
  inactive: "This session has not been activated by an officer yet.",
  finalized: "This session has been closed and finalized.",
  not_found: "Session not found.",
  not_eligible: "You are not on the attendee list for this event.",
  duplicate: "Attendance was already recorded for this session.",
  revoked: "This QR code was revoked. Scan the code that is currently displayed.",
  wrong_session: "This QR code belongs to a different event or session than the one you selected.",
  unknown_card: "This card is not registered to a student.",
  forbidden: "You are not allowed to record attendance for this session.",
};

export type AttendanceResult =
  | { ok: true; status: "PRESENT" | "LATE"; attendee: string; firstName: string; at: Date }
  | { ok: false; reason: Failure; attendee?: string; at?: Date };

async function loadSession(sessionId: string) {
  return db.eventSession.findUnique({ where: { id: sessionId }, include: { event: true } });
}

/**
 * Core rules for every capture method. The caller has already established WHO is acting and, for
 * officers and devices, that they may act on this session's organization.
 */
export async function recordAttendance(opts: {
  sessionId: string; userId: string; source: Exclude<AttendanceSource, "MANUAL" | "SYSTEM">;
  operatorId?: string | null; now?: Date;
}): Promise<AttendanceResult> {
  const now = opts.now ?? new Date();
  const session = await loadSession(opts.sessionId);
  if (!session) return { ok: false, reason: "not_found" };
  const { event } = session;
  if (event.status !== "PUBLISHED") return { ok: false, reason: "closed" };
  if (session.finalizedAt) return { ok: false, reason: "finalized" };
  if (!session.active) return { ok: false, reason: "inactive" };
  if (now < session.opensAt || now > session.closesAt) return { ok: false, reason: "closed" };

  const user = await db.user.findUnique({ where: { id: opts.userId }, select: { id: true, firstName: true, lastName: true, status: true } });
  if (!user || user.status === "DISABLED" || !(await isExpectedAttendee(event, user.id))) return { ok: false, reason: "not_eligible" };
  const attendee = `${user.firstName} ${user.lastName}`;

  const status: "PRESENT" | "LATE" = now.getTime() > session.startsAt.getTime() + session.graceMinutes * 60_000 ? "LATE" : "PRESENT";
  try {
    await db.$transaction([
      db.attendanceRecord.create({
        data: {
          eventId: event.id, sessionId: session.id, userId: user.id, status, source: opts.source, scannedById: opts.operatorId ?? null, scannedAt: now,
        },
      }),
      db.auditLog.create({
        data: { actorUserId: opts.operatorId ?? user.id, action: "attendance.record", targetType: "session", targetId: session.id, metadata: { attendeeId: user.id, status, source: opts.source } },
      }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const earlier = await db.attendanceRecord.findUnique({ where: { sessionId_userId: { sessionId: session.id, userId: user.id } } });
      return { ok: false, reason: "duplicate", attendee, at: earlier?.scannedAt };
    }
    throw e;
  }
  return { ok: true, status, attendee, firstName: user.firstName, at: now };
}

/** Method C: an officer scans a member's rotating QR or an ID-card barcode (student number). */
export async function recordOfficerScan(officer: PolicyUser & { id: string }, sessionId: string, input: string, now = new Date()): Promise<AttendanceResult> {
  const session = await db.eventSession.findUnique({ where: { id: sessionId }, select: { event: { select: { organizationId: true } } } });
  // Same answer for "missing" and "someone else's organization" so session ids can't be probed.
  if (!session || !canOrg(officer, "attendance.scan", session.event.organizationId)) return { ok: false, reason: "not_found" };

  const text = input.trim();
  let userId: string | null = null;
  if (text.startsWith("tpk1.")) {
    const qr = verifyMemberQr(text, now.getTime());
    if (!qr.ok) return { ok: false, reason: qr.reason };
    userId = qr.userId;
  } else {
    const profile = await db.studentProfile.findUnique({ where: { studentNumber: text }, select: { userId: true } });
    if (!profile) return { ok: false, reason: "invalid" };
    userId = profile.userId;
  }
  return recordAttendance({ sessionId, userId, source: "OFFICER_SCAN", operatorId: officer.id, now });
}

/**
 * Method B: a signed-in student checks in with the session QR. The venue is display information only;
 * nothing about the student's device or position is requested or checked.
 * When the student picked a session in the app (`selectedSessionId`), the scanned code must belong to it.
 */
export async function selfCheckIn(userId: string, token: string, opts: { selectedSessionId?: string; now?: Date } = {}): Promise<AttendanceResult> {
  const now = opts.now ?? new Date();
  const qr = verifySessionQr(token, now.getTime());
  if (!qr.ok) return { ok: false, reason: qr.reason };
  if (opts.selectedSessionId && opts.selectedSessionId !== qr.sessionId) return { ok: false, reason: "wrong_session" };
  const session = await db.eventSession.findUnique({ where: { id: qr.sessionId }, select: { qrEpoch: true } });
  if (!session) return { ok: false, reason: "not_found" };
  if (session.qrEpoch !== qr.epoch) return { ok: false, reason: "revoked" };
  return recordAttendance({ sessionId: qr.sessionId, userId, source: "QR_SELF", now });
}

/** Revokes every check-in QR issued so far for the session; the next code shown works again. */
export async function revokeSessionQr(officer: PolicyUser & { id: string }, sessionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await db.eventSession.findUnique({ where: { id: sessionId }, select: { event: { select: { organizationId: true } } } });
  if (!s || !canOrg(officer, "attendance.scan", s.event.organizationId)) return { ok: false, error: "Session not found." };
  await db.eventSession.update({ where: { id: sessionId }, data: { qrEpoch: { increment: 1 } } });
  await db.auditLog.create({ data: { actorUserId: officer.id, action: "session.revoke_qr", targetType: "session", targetId: sessionId } });
  return { ok: true };
}

/**
 * Sessions an RFID terminal can record into without being told which: sessions of the terminal's organization that an
 * officer has activated, that are not finalized, whose event is published, and that are inside their open/close time.
 * The terminal records automatically only when exactly one matches (two at once would be a guess).
 */
export function openSessionsFor(organizationId: string, now = new Date()) {
  return db.eventSession.findMany({
    where: { active: true, finalizedAt: null, opensAt: { lte: now }, closesAt: { gte: now }, event: { organizationId, status: "PUBLISHED" } },
    orderBy: { opensAt: "asc" }, take: 5,
    select: { id: true, label: true, event: { select: { title: true } } },
  });
}

/** Method A: a registered RFID terminal reports a card UID. Authentication of the device is the caller's job. */
export async function rfidTap(device: { id: string; organizationId: string }, sessionId: string, cardUid: string, now = new Date()): Promise<AttendanceResult> {
  const session = await db.eventSession.findUnique({ where: { id: sessionId }, select: { event: { select: { organizationId: true } } } });
  if (!session || session.event.organizationId !== device.organizationId) return { ok: false, reason: "not_found" };
  const profile = await db.studentProfile.findUnique({ where: { rfidUid: cardUid.trim().toUpperCase() }, select: { userId: true } });
  if (!profile) return { ok: false, reason: "unknown_card" };
  return recordAttendance({ sessionId, userId: profile.userId, source: "RFID", now });
}

// ------------------------------------------------------------------ officer management

type Manager = PolicyUser & { id: string };
type Fail = { ok: false; error: string };

async function sessionOrg(sessionId: string) {
  return db.eventSession.findUnique({ where: { id: sessionId }, include: { event: { select: { organizationId: true, status: true } } } });
}

/** Activate/deactivate the scanner session (all capture methods require an active session). */
export async function setSessionActive(officer: Manager, sessionId: string, active: boolean): Promise<{ ok: true } | Fail> {
  const s = await sessionOrg(sessionId);
  if (!s || !canOrg(officer, "attendance.scan", s.event.organizationId)) return { ok: false, error: "Session not found." };
  if (s.finalizedAt) return { ok: false, error: "This session is already finalized." };
  if (active && s.event.status !== "PUBLISHED") return { ok: false, error: "Publish the event before activating attendance." };
  await db.eventSession.update({ where: { id: sessionId }, data: { active } });
  await db.auditLog.create({ data: { actorUserId: officer.id, action: active ? "session.activate" : "session.deactivate", targetType: "session", targetId: sessionId } });
  return { ok: true };
}

/**
 * Closes a session. Expected attendees without a record are marked ABSENT, then consequences are calculated,
 * all in one transaction. Re-running changes nothing (the finalize claim is atomic and absences use skipDuplicates).
 */
export async function finalizeSession(officer: Manager, sessionId: string): Promise<{ ok: true; absent: number } | Fail> {
  const s = await db.eventSession.findUnique({ where: { id: sessionId }, include: { event: true } });
  if (!s || !canOrg(officer, "attendance.manual", s.event.organizationId)) return { ok: false, error: "Session not found." };
  if (s.event.status !== "PUBLISHED") return { ok: false, error: "Only published events can be finalized." };
  if (s.finalizedAt) return { ok: false, error: "This session was already finalized." };

  const expected = await expectedAttendeeIds(s.event);
  const startedAt = new Date();
  const absent = await db.$transaction(async (tx) => {
    const claim = await tx.eventSession.updateMany({ where: { id: sessionId, finalizedAt: null }, data: { finalizedAt: new Date(), finalizedById: officer.id, active: false } });
    if (claim.count === 0) return -1;
    const have = new Set((await tx.attendanceRecord.findMany({ where: { sessionId }, select: { userId: true } })).map((r) => r.userId));
    const missing = expected.filter((id) => !have.has(id));
    if (missing.length) {
      await tx.attendanceRecord.createMany({
        data: missing.map((userId) => ({ eventId: s.eventId, sessionId, userId, status: "ABSENT" as const, source: "SYSTEM" as const })),
        skipDuplicates: true,
      });
    }
    await tx.auditLog.create({ data: { actorUserId: officer.id, action: "session.finalize", targetType: "session", targetId: sessionId, metadata: { absent: missing.length } } });
    await calculateConsequencesForSession(tx, sessionId);
    return missing.length;
  });
  if (absent === -1) return { ok: false, error: "This session was already finalized." };
  const fresh = await db.consequence.findMany({ where: { eventId: s.eventId, calculatedAt: { gte: startedAt } }, select: { userId: true } });
  await notify(fresh.map((c) => c.userId), { kind: "consequence", title: "A consequence was recorded for you", body: `${s.event.title} — see the details under Consequences.`, href: "/consequences" });
  return { ok: true, absent };
}

/** Manual entry for a student the officer selects (requires a remark; recorded with the operator). */
export async function manualEntry(officer: Manager, sessionId: string, userId: string, status: "PRESENT" | "LATE", remark: string, now = new Date()): Promise<{ ok: true } | Fail> {
  const s = await sessionOrg(sessionId);
  if (!s || !canOrg(officer, "attendance.manual", s.event.organizationId)) return { ok: false, error: "Session not found." };
  if (s.event.status !== "PUBLISHED") return { ok: false, error: "Only published events accept attendance." };
  if (!remark.trim()) return { ok: false, error: "Enter a remark explaining the manual entry." };
  const event = await db.event.findUniqueOrThrow({ where: { id: s.eventId } });
  if (!(await isExpectedAttendee(event, userId))) return { ok: false, error: "That person is not on this event's attendee list." };

  const existing = await db.attendanceRecord.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
  if (existing && existing.status !== "ABSENT") return { ok: false, error: "Attendance is already recorded for this person. Use a correction instead." };
  if (existing) return adjustAttendance(officer, existing.id, status, remark);

  try {
    await db.$transaction([
      db.attendanceRecord.create({ data: { eventId: s.eventId, sessionId, userId, status, source: "MANUAL", scannedById: officer.id, scannedAt: now, remark: remark.trim().slice(0, 300) } }),
      db.auditLog.create({ data: { actorUserId: officer.id, action: "attendance.manual", targetType: "session", targetId: sessionId, metadata: { userId, status } } }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "Attendance is already recorded for this person." };
    throw e;
  }
  return { ok: true };
}

/**
 * Corrects a record (including excusing an absence). The operator, time and before/after values are kept in the
 * audit trail. If the session was finalized, consequences are re-evaluated without creating duplicates.
 */
export async function adjustAttendance(officer: Manager, recordId: string, status: AttendanceStatus, remark: string): Promise<{ ok: true } | Fail> {
  const rec = await db.attendanceRecord.findUnique({ where: { id: recordId }, include: { session: { include: { event: { select: { organizationId: true } } } } } });
  if (!rec) return { ok: false, error: "Record not found." };
  const orgId = rec.session.event.organizationId;
  // Excusing is a distinct authority from correcting.
  const allowed = status === "EXCUSED" ? canOrg(officer, "attendance.excuse", orgId) : canOrg(officer, "attendance.manual", orgId);
  if (!allowed) return { ok: false, error: "Record not found." };
  if (!remark.trim()) return { ok: false, error: "Enter a remark explaining the correction." };
  if (rec.status === status) return { ok: true };

  await db.$transaction(async (tx) => {
    await tx.attendanceRecord.update({ where: { id: recordId }, data: { status, remark: remark.trim().slice(0, 300), modifiedById: officer.id, modifiedAt: new Date() } });
    await tx.auditLog.create({
      data: { actorUserId: officer.id, action: "attendance.adjust", targetType: "attendance_record", targetId: recordId, metadata: { from: rec.status, to: status, remark: remark.trim().slice(0, 300) } },
    });
    if (rec.session.finalizedAt) await reconcileConsequencesForRecord(tx, recordId);
  });
  return { ok: true };
}
