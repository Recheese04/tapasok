import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";

// Registering a student's RFID card. Two ways, both ending in the same unique StudentProfile.rfidUid:
//   1. Tap to register: an administrator opens a short window on one terminal; the next card tapped there is assigned to
//      the student instead of being recorded as attendance. The UID is then exactly what that terminal reports at events.
//   2. Manual: the UID is typed (or typed by a USB reader) into the form.
// A card can belong to one student only; every change is audited.

export const ENROLL_WINDOW_MS = 60_000;
export const UID_RE = /^[0-9A-F]{4,20}$/;
export const normalizeUid = (s: string) => s.trim().toUpperCase().replace(/[\s:-]/g, "");

type Fail = { ok: false; error: string };

async function owner(uid: string) {
  return db.studentProfile.findUnique({ where: { rfidUid: uid }, select: { userId: true, user: { select: { firstName: true, lastName: true } } } });
}

/** Opens a registration window on a terminal for one student. Any earlier open window on that terminal or for that student is cancelled. */
export async function startEnrollment(actorId: string, userId: string, deviceId: string): Promise<{ ok: true; id: string; expiresAt: Date } | Fail> {
  const [profile, device] = await Promise.all([
    db.studentProfile.findUnique({ where: { userId }, select: { id: true } }),
    db.scannerDevice.findUnique({ where: { id: deviceId }, select: { active: true } }),
  ]);
  if (!profile) return { ok: false, error: "Only student accounts can have an RFID card." };
  if (!device?.active) return { ok: false, error: "Choose an active terminal." };
  const now = new Date();
  const e = await db.$transaction(async (tx) => {
    await tx.rfidEnrollment.updateMany({ where: { OR: [{ deviceId }, { userId }], completedAt: null, cancelledAt: null, failure: null, expiresAt: { gt: now } }, data: { cancelledAt: now } });
    const created = await tx.rfidEnrollment.create({ data: { deviceId, userId, createdById: actorId, expiresAt: new Date(now.getTime() + ENROLL_WINDOW_MS) } });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "rfid.enroll_start", targetType: "user", targetId: userId, metadata: { deviceId } } });
    return created;
  });
  return { ok: true, id: e.id, expiresAt: e.expiresAt };
}

export type EnrollmentState =
  | { state: "waiting"; expiresAt: string }
  | { state: "done"; cardUid: string }
  | { state: "failed"; message: string }
  | { state: "expired" }
  | { state: "cancelled" };

export async function enrollmentState(id: string): Promise<EnrollmentState | null> {
  const e = await db.rfidEnrollment.findUnique({ where: { id } });
  if (!e) return null;
  if (e.completedAt && e.cardUid) return { state: "done", cardUid: e.cardUid };
  if (e.failure) return { state: "failed", message: e.failure };
  if (e.cancelledAt) return { state: "cancelled" };
  if (e.expiresAt <= new Date()) return { state: "expired" };
  return { state: "waiting", expiresAt: e.expiresAt.toISOString() };
}

export async function cancelEnrollment(actorId: string, id: string) {
  const { count } = await db.rfidEnrollment.updateMany({ where: { id, completedAt: null, cancelledAt: null, failure: null }, data: { cancelledAt: new Date() } });
  if (count) await db.auditLog.create({ data: { actorUserId: actorId, action: "rfid.enroll_cancel", targetType: "rfid_enrollment", targetId: id } });
}

/**
 * Called by the terminal endpoint for every tap, before attendance. When the terminal has an open registration window, the
 * card is registered (or the window fails with a reason) and the tap is NOT counted as attendance. Returns null otherwise.
 */
export async function consumeEnrollment(deviceId: string, rawUid: string, now = new Date()): Promise<{ ok: true; name: string } | { ok: false; message: string } | null> {
  const e = await db.rfidEnrollment.findFirst({
    where: { deviceId, completedAt: null, cancelledAt: null, failure: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  if (!e) return null;
  const uid = normalizeUid(rawUid);
  const fail = async (message: string) => {
    await db.rfidEnrollment.update({ where: { id: e.id }, data: { failure: message, cardUid: uid } });
    return { ok: false as const, message };
  };
  if (!UID_RE.test(uid)) return fail("The terminal sent an unreadable card number. Try again.");
  const taken = await owner(uid);
  if (taken && taken.userId !== e.userId) return fail(`This card is already registered to ${taken.user.firstName} ${taken.user.lastName}. Remove it there first.`);
  try {
    await db.$transaction([
      db.studentProfile.update({ where: { userId: e.userId }, data: { rfidUid: uid } }),
      db.rfidEnrollment.update({ where: { id: e.id }, data: { completedAt: now, cardUid: uid } }),
      db.auditLog.create({ data: { actorUserId: e.createdById, action: "rfid.register_tap", targetType: "user", targetId: e.userId, metadata: { deviceId, cardUid: uid } } }),
    ]);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return fail("This card was just registered to someone else.");
    throw err;
  }
  return { ok: true, name: e.user.firstName };
}

/** Manual entry (typed or from a USB reader) and removal. `uid` null removes the card. */
export async function setCardManually(actorId: string, userId: string, uid: string | null): Promise<{ ok: true } | Fail> {
  const profile = await db.studentProfile.findUnique({ where: { userId }, select: { rfidUid: true } });
  if (!profile) return { ok: false, error: "Only student accounts can have an RFID card." };
  if (uid !== null) {
    if (!UID_RE.test(uid)) return { ok: false, error: "Enter 4 to 20 hexadecimal characters (0-9 and A-F), for example 04A1B2C3." };
    const taken = await owner(uid);
    if (taken && taken.userId !== userId) return { ok: false, error: `This card is already registered to ${taken.user.firstName} ${taken.user.lastName}.` };
  }
  try {
    await db.studentProfile.update({ where: { userId }, data: { rfidUid: uid } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, error: "This card is already registered to another student." };
    throw err;
  }
  await db.auditLog.create({ data: { actorUserId: actorId, action: uid ? "rfid.register_manual" : "rfid.remove", targetType: "user", targetId: userId, metadata: uid ? { cardUid: uid, previous: profile.rfidUid } : { previous: profile.rfidUid } } });
  return { ok: true };
}
