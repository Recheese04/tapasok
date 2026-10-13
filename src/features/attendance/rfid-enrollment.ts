import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";

// Registering a student's RFID card. Two ways, both ending in the same unique StudentProfile.rfidUid:
//   1. Scan to register: a System Admin opens a short window on one terminal for one student. The next card tapped on that
//      terminal is CAPTURED (its UID is held on the window) instead of being recorded as attendance. Nothing is saved until
//      the admin sees the detected UID on the page and confirms. The UID is exactly what that terminal reports at events.
//   2. Manual: the UID is typed (or typed by a USB reader) into the form.
// A card belongs to one student only. Replacing a student's card, or moving a card from another student, needs an explicit
// confirmation. Every start, capture, cancel, registration, replacement, reassignment and removal is audited.
//
// Window lifecycle (rfid_enrollments): open (cardUid null) -> captured (cardUid set, expiresAt = confirmation deadline)
// -> completed | cancelled | failed. Only an open window takes taps, so a captured card cannot be overwritten by a later tap.

export const ENROLL_WINDOW_MS = 60_000;
export const CONFIRM_WINDOW_MS = 5 * 60_000;
export const UID_RE = /^[0-9A-F]{4,20}$/;
export const normalizeUid = (s: string) => s.trim().toUpperCase().replace(/[\s:-]/g, "");

type Fail = { ok: false; error: string };
export type Person = { userId: string; name: string; studentNumber: string | null };

async function owner(uid: string, client: Prisma.TransactionClient = db): Promise<Person | null> {
  const p = await client.studentProfile.findUnique({ where: { rfidUid: uid }, select: { userId: true, studentNumber: true, user: { select: { firstName: true, lastName: true } } } });
  return p ? { userId: p.userId, name: `${p.user.firstName} ${p.user.lastName}`, studentNumber: p.studentNumber } : null;
}

/** Opens a registration window on a terminal for one student. Any earlier unfinished window on that terminal or for that student is cancelled. */
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
  | { state: "waiting"; expiresAt: string; device: string; lastSeenAt: string | null }
  | {
      state: "captured"; cardUid: string; expiresAt: string; device: string;
      student: Person; currentCard: string | null; // the student's card today (replacing it needs confirmation)
      owner: Person | null;                          // another student who holds this card (moving it needs confirmation)
    }
  | { state: "done"; cardUid: string }
  | { state: "failed"; message: string }
  | { state: "expired"; captured: boolean; device: string; lastSeenAt: string | null }
  | { state: "cancelled" };

export async function enrollmentState(id: string, now = new Date()): Promise<EnrollmentState | null> {
  const e = await db.rfidEnrollment.findUnique({
    where: { id },
    include: {
      device: { select: { name: true, active: true, lastSeenAt: true } },
      user: { select: { firstName: true, lastName: true, studentProfile: { select: { studentNumber: true, rfidUid: true } } } },
    },
  });
  if (!e) return null;
  if (e.completedAt && e.cardUid) return { state: "done", cardUid: e.cardUid };
  if (e.failure) return { state: "failed", message: e.failure };
  if (e.cancelledAt) return { state: "cancelled" };
  if (!e.device.active) return { state: "failed", message: `The terminal “${e.device.name}” was revoked. Choose another terminal.` };
  const lastSeenAt = e.device.lastSeenAt?.toISOString() ?? null;
  if (e.expiresAt <= now) return { state: "expired", captured: !!e.cardUid, device: e.device.name, lastSeenAt };
  if (!e.cardUid) return { state: "waiting", expiresAt: e.expiresAt.toISOString(), device: e.device.name, lastSeenAt };
  const holder = await owner(e.cardUid);
  return {
    state: "captured", cardUid: e.cardUid, expiresAt: e.expiresAt.toISOString(), device: e.device.name,
    student: { userId: e.userId, name: `${e.user.firstName} ${e.user.lastName}`, studentNumber: e.user.studentProfile?.studentNumber ?? null },
    currentCard: e.user.studentProfile?.rfidUid ?? null,
    owner: holder && holder.userId !== e.userId ? holder : null,
  };
}

export async function cancelEnrollment(actorId: string, id: string) {
  const { count } = await db.rfidEnrollment.updateMany({ where: { id, completedAt: null, cancelledAt: null, failure: null }, data: { cancelledAt: new Date() } });
  if (count) await db.auditLog.create({ data: { actorUserId: actorId, action: "rfid.enroll_cancel", targetType: "rfid_enrollment", targetId: id } });
}

/**
 * Called by the terminal endpoint for every tap, before attendance. When the terminal has an OPEN registration window, the
 * card's UID is captured for the admin to confirm, and the tap is NOT counted as attendance. Returns null otherwise.
 */
export async function consumeEnrollment(deviceId: string, rawUid: string, now = new Date()): Promise<{ ok: true; name: string } | { ok: false; message: string } | null> {
  const e = await db.rfidEnrollment.findFirst({
    where: { deviceId, cardUid: null, completedAt: null, cancelledAt: null, failure: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { firstName: true } } },
  });
  if (!e) return null;
  const uid = normalizeUid(rawUid);
  if (!UID_RE.test(uid)) {
    const { count } = await db.rfidEnrollment.updateMany({
      where: { id: e.id, cardUid: null, completedAt: null, cancelledAt: null, failure: null },
      data: { failure: "The terminal sent an unreadable card number. Start again and tap the card once more." },
    });
    return count ? { ok: false, message: "Unreadable card number." } : null;
  }
  // Claim the open window atomically, so two taps in quick succession cannot both be captured.
  const { count } = await db.rfidEnrollment.updateMany({
    where: { id: e.id, cardUid: null, completedAt: null, cancelledAt: null, failure: null },
    data: { cardUid: uid, expiresAt: new Date(now.getTime() + CONFIRM_WINDOW_MS) },
  });
  if (!count) return null;
  await db.auditLog.create({ data: { actorUserId: e.createdById, action: "rfid.enroll_capture", targetType: "user", targetId: e.userId, metadata: { deviceId, cardUid: uid } } });
  return { ok: true, name: e.user.firstName };
}

export type CardConfirmation = { replace?: boolean; reassign?: boolean };
export type CardResult =
  | { ok: true; cardUid: string }
  | { ok: false; error: string; needs?: undefined }
  | { ok: false; error: string; needs: "replace"; current: string }
  | { ok: false; error: string; needs: "reassign"; owner: Person };

type Tx = Prisma.TransactionClient;

/**
 * The one place a card is assigned (runs inside the caller's transaction). Refuses invalid UIDs; asks for confirmation before
 * replacing the student's current card or moving the card away from another student; then assigns it and audits what happened.
 */
async function assignCard(tx: Tx, actorId: string, userId: string, uid: string, confirmed: CardConfirmation, how: "tap" | "manual", extra: Record<string, string> = {}): Promise<CardResult> {
  if (!UID_RE.test(uid)) return { ok: false, error: "Enter 4 to 20 hexadecimal characters (0-9 and A-F), for example 04A1B2C3." };
  const profile = await tx.studentProfile.findUnique({ where: { userId }, select: { rfidUid: true } });
  if (!profile) return { ok: false, error: "Only student accounts can have an RFID card." };
  if (profile.rfidUid === uid) return { ok: false, error: `Card ${uid} is already registered to this student.` };
  const holder = await owner(uid, tx);
  const moving = !!holder && holder.userId !== userId;
  if (moving && !confirmed.reassign) {
    return { ok: false, needs: "reassign", owner: holder, error: `Card ${uid} is registered to ${holder.name}${holder.studentNumber ? ` (${holder.studentNumber})` : ""}. Confirm to move it to this student.` };
  }
  if (profile.rfidUid && !confirmed.replace) {
    return { ok: false, needs: "replace", current: profile.rfidUid, error: `This student already has card ${profile.rfidUid}. Confirm to replace it.` };
  }
  if (moving) {
    await tx.studentProfile.update({ where: { userId: holder.userId }, data: { rfidUid: null } });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "rfid.reassign", targetType: "user", targetId: holder.userId, metadata: { cardUid: uid, toUserId: userId } } });
  }
  await tx.studentProfile.update({ where: { userId }, data: { rfidUid: uid } });
  await tx.auditLog.create({
    data: {
      actorUserId: actorId, action: profile.rfidUid ? "rfid.replace" : how === "tap" ? "rfid.register_tap" : "rfid.register_manual", targetType: "user", targetId: userId,
      metadata: { cardUid: uid, previous: profile.rfidUid, method: how, ...(moving ? { movedFromUserId: holder.userId } : {}), ...extra },
    },
  });
  return { ok: true, cardUid: uid };
}

/** Runs a card change in one transaction; a unique-index clash (a concurrent registration of the same card) becomes a message. */
async function inTransaction(run: (tx: Tx) => Promise<CardResult>): Promise<CardResult> {
  try {
    return await db.$transaction(run);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, error: "This card was just registered to another student. Check and try again." };
    throw err;
  }
}

/**
 * Confirms a captured scan: the admin has seen the detected UID and the student it will belong to. The window row is locked
 * for the whole decision, so two confirmations (two tabs, a double click) cannot both assign the card.
 */
export function confirmEnrollment(actorId: string, id: string, confirmed: CardConfirmation, now = new Date()): Promise<CardResult> {
  return inTransaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM rfid_enrollments WHERE id = ${id}::uuid FOR UPDATE`;
    const e = await tx.rfidEnrollment.findUnique({ where: { id }, select: { userId: true, deviceId: true, cardUid: true, completedAt: true, cancelledAt: true, failure: true, expiresAt: true, device: { select: { active: true } } } });
    if (!e || !e.cardUid || e.completedAt || e.cancelledAt || e.failure) return { ok: false, error: "There is no scanned card waiting for confirmation. Start the scan again." };
    if (e.expiresAt <= now) return { ok: false, error: "The confirmation time ran out. Start the scan again." };
    if (!e.device.active) return { ok: false, error: "The terminal that read this card was revoked. Start again on an active terminal." };
    const res = await assignCard(tx, actorId, e.userId, e.cardUid, confirmed, "tap", { deviceId: e.deviceId, enrollmentId: id });
    if (res.ok) await tx.rfidEnrollment.update({ where: { id }, data: { completedAt: now } });
    return res;
  });
}

/** Manual entry (typed or from a USB reader). */
export function setCardManually(actorId: string, userId: string, uid: string, confirmed: CardConfirmation = {}): Promise<CardResult> {
  return inTransaction((tx) => assignCard(tx, actorId, userId, uid, confirmed, "manual"));
}

/** Removes (revokes) the student's card. */
export async function removeCard(actorId: string, userId: string): Promise<{ ok: true } | Fail> {
  const profile = await db.studentProfile.findUnique({ where: { userId }, select: { rfidUid: true } });
  if (!profile?.rfidUid) return { ok: false, error: "This student has no card to remove." };
  await db.$transaction([
    db.studentProfile.update({ where: { userId }, data: { rfidUid: null } }),
    db.auditLog.create({ data: { actorUserId: actorId, action: "rfid.remove", targetType: "user", targetId: userId, metadata: { previous: profile.rfidUid } } }),
  ]);
  return { ok: true };
}
