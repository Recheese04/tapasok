"use server";

import { z } from "zod";
import { db } from "@/lib/database/client";
import { requireUser } from "@/lib/auth/dal";
import { assertOrgPermission } from "@/lib/permissions";
import { makeMemberQr, makeSessionQr, checkInUrl } from "./qr";
import { adjustAttendance, finalizeSession, manualEntry, MESSAGES, recordOfficerScan, revokeSessionQr, selfCheckIn, setSessionActive, type AttendanceResult, type Failure } from "./service";

export type ScanActionResult =
  | { ok: true; attendee: string; status: "PRESENT" | "LATE"; at: string }
  | { ok: false; reason: Failure; message: string; attendee?: string; at?: string };

const uuid = z.uuid();

function present(res: AttendanceResult): ScanActionResult {
  if (res.ok) return { ok: true, attendee: res.attendee, status: res.status, at: res.at.toISOString() };
  return { ok: false, reason: res.reason, message: MESSAGES[res.reason], attendee: res.attendee, at: res.at?.toISOString() };
}

/** Method C: the scanner page submits a scanned member QR or student-ID barcode value. */
export async function scanAttendanceAction(sessionId: string, input: string): Promise<ScanActionResult> {
  const user = await requireUser();
  const parsed = z.object({ sessionId: uuid, input: z.string().min(3).max(300) }).safeParse({ sessionId, input });
  if (!parsed.success) return { ok: false, reason: "invalid", message: MESSAGES.invalid };
  return present(await recordOfficerScan(user, parsed.data.sessionId, parsed.data.input));
}

/** The signed-in member's current QR payload. Only ever issued for the caller's own id. */
export async function getMyQrAction(): Promise<{ payload: string } | { error: string }> {
  const user = await requireUser();
  if (user.memberships.length === 0) return { error: "Join an organization to get an attendance QR code." };
  return { payload: makeMemberQr(user.id) };
}

/** Method B display: officers show this rotating code; phones scan it. Includes the details shown beside the code. */
export async function getSessionQrAction(sessionId: string): Promise<{ url: string; token: string; details: { event: string; organization: string; session: string; venue: string; startsAt: string; endsAt: string } } | { error: string }> {
  const id = uuid.safeParse(sessionId);
  if (!id.success) return { error: "Session not found." };
  const s = await db.eventSession.findUnique({
    where: { id: id.data },
    select: { label: true, active: true, finalizedAt: true, qrEpoch: true, event: { select: { organizationId: true, title: true, venue: true, startsAt: true, endsAt: true, organization: { select: { name: true } } } } },
  });
  if (!s) return { error: "Session not found." };
  await assertOrgPermission("attendance.scan", s.event.organizationId);
  if (!s.active || s.finalizedAt) return { error: "Activate the session to show its check-in code." };
  const token = makeSessionQr(id.data, s.qrEpoch);
  return {
    token, url: checkInUrl(token),
    details: { event: s.event.title, organization: s.event.organization.name, session: s.label, venue: s.event.venue, startsAt: s.event.startsAt.toISOString(), endsAt: s.event.endsAt.toISOString() },
  };
}

const checkInSchema = z.object({ token: z.string().min(20).max(500), sessionId: uuid.optional() });

/** The signed-in student checks in. No location or device data is read; `sessionId` is the session they selected. */
export async function selfCheckInAction(token: string, sessionId?: string): Promise<ScanActionResult> {
  const user = await requireUser();
  const parsed = checkInSchema.safeParse({ token, sessionId });
  if (!parsed.success) return { ok: false, reason: "invalid", message: MESSAGES.invalid };
  return present(await selfCheckIn(user.id, parsed.data.token, { selectedSessionId: parsed.data.sessionId }));
}

/** Officer action: revoke every check-in QR issued so far for a session. */
export async function revokeSessionQrAction(fd: FormData) {
  const user = await requireUser();
  const id = uuid.safeParse(fd.get("sessionId"));
  if (id.success) await revokeSessionQr(user, id.data);
}

export type SessionActionState = { error?: string; success?: string };

export async function setSessionActiveAction(fd: FormData) {
  const user = await requireUser();
  const id = uuid.safeParse(fd.get("sessionId"));
  if (id.success) await setSessionActive(user, id.data, fd.get("active") === "true");
}

/** Same operation as setSessionActiveAction, but reports the outcome so a dialog can show why it did not work. */
export async function toggleSessionAction(sessionId: string, active: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(sessionId);
  if (!id.success) return { ok: false, error: "Session not found." };
  const res = await setSessionActive(user, id.data, active);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function finalizeSessionAction(fd: FormData) {
  const user = await requireUser();
  const id = uuid.safeParse(fd.get("sessionId"));
  if (id.success) await finalizeSession(user, id.data);
}

export async function manualEntryAction(_prev: SessionActionState, fd: FormData): Promise<SessionActionState> {
  const user = await requireUser();
  const parsed = z.object({ sessionId: uuid, userId: uuid, status: z.enum(["PRESENT", "LATE"]), remark: z.string().trim().min(3, "Enter a remark.").max(300) })
    .safeParse({ sessionId: fd.get("sessionId"), userId: fd.get("userId"), status: fd.get("status"), remark: fd.get("remark") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const res = await manualEntry(user, parsed.data.sessionId, parsed.data.userId, parsed.data.status, parsed.data.remark);
  return res.ok ? { success: "Attendance recorded." } : { error: res.error };
}

export async function adjustAttendanceAction(_prev: SessionActionState, fd: FormData): Promise<SessionActionState> {
  const user = await requireUser();
  const parsed = z.object({ recordId: uuid, status: z.enum(["PRESENT", "LATE", "ABSENT", "EXCUSED"]), remark: z.string().trim().min(3, "Enter a remark.").max(300) })
    .safeParse({ recordId: fd.get("recordId"), status: fd.get("status"), remark: fd.get("remark") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const res = await adjustAttendance(user, parsed.data.recordId, parsed.data.status, parsed.data.remark);
  return res.ok ? { success: "Updated." } : { error: res.error };
}
