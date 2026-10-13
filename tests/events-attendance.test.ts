import { describe, expect, it } from "vitest";
import { createEventAction, setEventStatusAction, updateEventAction } from "@/features/events/actions";
import { getEventForViewer, listEvents } from "@/features/events/queries";
import { getMyQrAction, getSessionQrAction, scanAttendanceAction, selfCheckInAction } from "@/features/attendance/actions";
import { checkInUrl, makeMemberQr, makeSessionQr, verifyMemberQr, verifySessionQr } from "@/features/attendance/qr";
import { adjustAttendance, finalizeSession, manualEntry, recordOfficerScan, revokeSessionQr, rfidTap, selfCheckIn, setSessionActive } from "@/features/attendance/service";
import { authenticateDevice, registerDevice, revokeDevice } from "@/features/attendance/devices";
import { registerDeviceAction } from "@/features/attendance/device-actions";
import { POST as rfidRoute } from "@/app/api/rfid/scan/route";
import { getSessionRoster } from "@/features/attendance/queries";
import { ForbiddenError } from "@/lib/permissions";
import { addMembership, db, form, makeUser, signInAs } from "./helpers/db";
import { auth, makeEvent, makeWorld, ROLES } from "./helpers/world";

const SESSION = (over: Record<string, unknown> = {}) => ({ label: "Time-In", kind: "TIME_IN", opensAt: "2030-01-10T08:30", startsAt: "2030-01-10T09:00", closesAt: "2030-01-10T10:30", graceMinutes: 15, ...over });
const eventForm = (orgId: string, over: Record<string, string> = {}) =>
  form({
    organizationId: orgId, title: "General Assembly", description: "", venue: "Auditorium", startsAt: "2030-01-10T09:00", endsAt: "2030-01-10T12:00", semesterId: "",
    targetMode: "ALL_MEMBERS", sessions: JSON.stringify([SESSION()]), targets: "[]", ruleIds: "[]", ...over,
  });

describe("events: permissions and validation", () => {
  it("lets only president, secretary and officer create events, only in their own organization", async () => {
    const w = await makeWorld();
    for (const r of ["TREASURER", "AUDITOR", "ADVISER", "MEMBER"] as const) {
      await signInAs(w.a[r].id);
      await expect(createEventAction({}, eventForm(w.orgA.id))).rejects.toBeInstanceOf(ForbiddenError);
    }
    for (const id of [w.admin.id, w.presidentB.id]) { await signInAs(id); await expect(createEventAction({}, eventForm(w.orgA.id))).rejects.toBeInstanceOf(ForbiddenError); }
    expect(await db.event.count()).toBe(0);

    for (const r of ["PRESIDENT", "SECRETARY", "OFFICER"] as const) {
      await signInAs(w.a[r].id);
      await expect(createEventAction({}, eventForm(w.orgA.id))).rejects.toThrow(/^NEXT_REDIRECT:\/events\//);
    }
    expect(await db.event.count()).toBe(3);
  });

  it("stores Manila times, builds sessions and sets the event window from them", async () => {
    const w = await makeWorld();
    await signInAs(w.a.PRESIDENT.id);
    await expect(createEventAction({}, eventForm(w.orgA.id, { sessions: JSON.stringify([SESSION(), SESSION({ label: "Time-Out", kind: "TIME_OUT", opensAt: "2030-01-10T11:30", startsAt: "2030-01-10T12:00", closesAt: "2030-01-10T13:00" })]) }))).rejects.toThrow("NEXT_REDIRECT");
    const e = await db.event.findFirstOrThrow({ include: { sessions: { orderBy: { position: "asc" } } } });
    expect(e.status).toBe("DRAFT");
    expect(e.startsAt.toISOString()).toBe("2030-01-10T01:00:00.000Z"); // 09:00 +08:00
    expect(e.sessions.map((s) => [s.label, s.kind, s.position])).toEqual([["Time-In", "TIME_IN", 1], ["Time-Out", "TIME_OUT", 2]]);
    expect(e.attendanceOpensAt.toISOString()).toBe("2030-01-10T00:30:00.000Z");
    expect(e.attendanceClosesAt.toISOString()).toBe("2030-01-10T05:00:00.000Z");
  });

  it("rejects bad times, sessions, targets and foreign rules", async () => {
    const w = await makeWorld();
    await signInAs(w.a.PRESIDENT.id);
    const bad = async (over: Record<string, string>) => createEventAction({}, eventForm(w.orgA.id, over));
    expect((await bad({ endsAt: "2030-01-10T08:00" })).fieldErrors?.endsAt).toBeTruthy();
    expect((await bad({ sessions: "[]" })).fieldErrors?.sessions).toBeTruthy();
    expect((await bad({ sessions: JSON.stringify([SESSION({ closesAt: "2030-01-10T08:00" })]) })).fieldErrors?.sessions).toBeTruthy();
    expect((await bad({ sessions: JSON.stringify([SESSION({ graceMinutes: 999 })]) })).fieldErrors).toBeTruthy();
    expect((await bad({ targetMode: "FILTERED", targets: "[]" })).fieldErrors?.targets).toBeTruthy();
    const foreign = await db.consequenceRule.create({ data: { organizationId: w.orgB.id, name: "B rule", fineAmount: 10 } });
    expect((await bad({ ruleIds: JSON.stringify([foreign.id]) })).fieldErrors?.ruleIds).toBeTruthy();
    expect(await db.event.count()).toBe(0);
  });

  it("authorizes updates against the event's real organization and locks sessions once attendance exists", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await signInAs(w.presidentB.id);
    const fd = eventForm(w.orgB.id); fd.set("eventId", ev.id); // forged organization
    await expect(updateEventAction({}, fd)).rejects.toBeInstanceOf(ForbiddenError);

    await signInAs(w.a.PRESIDENT.id);
    const own = eventForm(w.orgA.id, { title: "Renamed" }); own.set("eventId", ev.id);
    expect((await updateEventAction({}, own)).success).toBe("Saved.");
    expect((await db.eventSession.findMany({ where: { eventId: ev.id } })).length).toBe(1);

    const sess = await db.eventSession.findFirstOrThrow({ where: { eventId: ev.id } });
    await db.attendanceRecord.create({ data: { eventId: ev.id, sessionId: sess.id, userId: w.a.MEMBER.id } });
    const locked = eventForm(w.orgA.id, { title: "Again", sessions: JSON.stringify([SESSION(), SESSION({ label: "Extra" })]) }); locked.set("eventId", ev.id);
    expect((await updateEventAction({}, locked)).success).toMatch(/locked/);
    expect(await db.eventSession.count({ where: { eventId: ev.id } })).toBe(1);
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).title).toBe("Again");
  });

  it("hides drafts from non-managers and other organizations", async () => {
    const w = await makeWorld();
    const draft = await makeEvent(w.orgA.id, { status: "DRAFT", title: "Secret draft" });
    const pub = await makeEvent(w.orgA.id, { title: "Public" });
    const titles = async (id: string) => (await listEvents(await auth(id), { when: "upcoming", page: 1 })).rows.map((e) => e.title);
    expect(await titles(w.a.PRESIDENT.id)).toEqual(expect.arrayContaining(["Secret draft", "Public"]));
    expect(await titles(w.a.OFFICER.id)).toContain("Secret draft");
    expect(await titles(w.a.SECRETARY.id)).toContain("Secret draft");
    for (const r of ["TREASURER", "AUDITOR", "ADVISER", "MEMBER"] as const) expect(await titles(w.a[r].id)).toEqual(["Public"]);
    expect(await titles(w.presidentB.id)).toEqual([]);
    expect(await titles(w.admin.id)).toEqual([]);
    expect(await getEventForViewer(await auth(w.a.MEMBER.id), draft.id)).toBeNull();
    expect(await getEventForViewer(await auth(w.presidentB.id), pub.id)).toBeNull();
  });

  it("only managers change status; attended events cannot return to draft; leaving PUBLISHED deactivates scanners", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await signInAs(w.a.MEMBER.id);
    await expect(setEventStatusAction(form({ eventId: ev.id, status: "CANCELLED" }))).rejects.toBeInstanceOf(ForbiddenError);
    await signInAs(w.a.OFFICER.id);
    await db.attendanceRecord.create({ data: { eventId: ev.id, sessionId: ev.session.id, userId: w.a.MEMBER.id } });
    await setEventStatusAction(form({ eventId: ev.id, status: "DRAFT" }));
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe("PUBLISHED");
    await setEventStatusAction(form({ eventId: ev.id, status: "CANCELLED" }));
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe("CANCELLED");
    expect((await db.eventSession.findUniqueOrThrow({ where: { id: ev.session.id } })).active).toBe(false);
  });
});

describe("QR tokens", () => {
  const uid = "11111111-1111-4111-8111-111111111111";

  it("member tokens verify fresh and reject tampering, other users and junk", () => {
    const now = Date.now();
    const t = makeMemberQr(uid, now);
    expect(verifyMemberQr(t, now)).toEqual({ ok: true, userId: uid });
    const p = t.split(".");
    expect(verifyMemberQr([p[0], "22222222-2222-4222-8222-222222222222", p[2], p[3]].join("."), now)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyMemberQr(`${t.slice(0, -1)}${t.endsWith("A") ? "B" : "A"}`, now)).toEqual({ ok: false, reason: "invalid" });
    for (const junk of ["", "hello", "tpk1.a.b.c", "x".repeat(300)]) expect(verifyMemberQr(junk, now).ok).toBe(false);
    expect(verifyMemberQr(t, now + 61_000).ok).toBe(true);
    expect(verifyMemberQr(t, now + 3 * 60_000)).toEqual({ ok: false, reason: "expired" });
  });

  it("session tokens verify, rotate, accept the check-in URL, and are not interchangeable with member tokens", () => {
    const now = Date.now();
    const t = makeSessionQr(uid, 0, now);
    expect(verifySessionQr(t, now)).toEqual({ ok: true, sessionId: uid, epoch: 0 });
    expect(verifySessionQr(checkInUrl(t), now)).toEqual({ ok: true, sessionId: uid, epoch: 0 });
    expect(verifySessionQr(`${t.slice(0, -1)}${t.endsWith("A") ? "B" : "A"}`, now)).toEqual({ ok: false, reason: "invalid" });
    expect(verifySessionQr(t, now + 3 * 60_000)).toEqual({ ok: false, reason: "expired" });
    expect(verifySessionQr(makeMemberQr(uid, now), now).ok).toBe(false);
    expect(verifyMemberQr(t, now).ok).toBe(false);
    expect(verifySessionQr(makeMemberQr(uid, now).replace("tpk1", "tpks1"), now).ok).toBe(false);
  });

  it("issues a member QR only for the signed-in member, and the session QR only to scanning roles with an active session", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await signInAs(w.a.MEMBER.id);
    const mine = await getMyQrAction();
    expect("payload" in mine && verifyMemberQr(mine.payload)).toMatchObject({ ok: true, userId: w.a.MEMBER.id });
    await signInAs(w.nobody.id);
    expect(await getMyQrAction()).toHaveProperty("error");

    await signInAs(w.a.OFFICER.id);
    expect(await getSessionQrAction(ev.session.id)).toHaveProperty("token");
    await db.eventSession.update({ where: { id: ev.session.id }, data: { active: false } });
    expect(await getSessionQrAction(ev.session.id)).toHaveProperty("error");
    for (const id of [w.a.MEMBER.id, w.a.ADVISER.id, w.presidentB.id, w.admin.id]) {
      await signInAs(id);
      await expect(getSessionQrAction(ev.session.id)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});

describe("Method C: officer scan", () => {
  it("records a member scanned by QR or by student ID number, with operator and audit", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    const officer = await auth(w.a.OFFICER.id);
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.MEMBER.id))).toMatchObject({ ok: true, status: "PRESENT" });
    await db.studentProfile.create({ data: { userId: w.a.TREASURER.id, studentNumber: "2024-1111" } });
    expect(await recordOfficerScan(officer, ev.session.id, "2024-1111")).toMatchObject({ ok: true });
    const recs = await db.attendanceRecord.findMany({ orderBy: { scannedAt: "asc" } });
    expect(recs.map((r) => [r.userId, r.source, r.scannedById])).toEqual([[w.a.MEMBER.id, "OFFICER_SCAN", w.a.OFFICER.id], [w.a.TREASURER.id, "OFFICER_SCAN", w.a.OFFICER.id]]);
    expect(await db.auditLog.count({ where: { action: "attendance.record" } })).toBe(2);
    expect(await recordOfficerScan(officer, ev.session.id, "no-such-number")).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("marks Present within the grace period and Late after it", async () => {
    const w = await makeWorld();
    const officer = await auth(w.a.OFFICER.id);
    const onTime = await makeEvent(w.orgA.id, { startsAt: new Date(Date.now() - 5 * 60_000) });
    const late = await makeEvent(w.orgA.id, { title: "Late one", startsAt: new Date(Date.now() - 30 * 60_000) });
    expect(await recordOfficerScan(officer, onTime.session.id, makeMemberQr(w.a.MEMBER.id))).toMatchObject({ ok: true, status: "PRESENT" });
    expect(await recordOfficerScan(officer, late.session.id, makeMemberQr(w.a.MEMBER.id))).toMatchObject({ ok: true, status: "LATE" });
  });

  it("rejects duplicates and handles simultaneous scans with exactly one record", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    const officer = await auth(w.a.OFFICER.id);
    await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.MEMBER.id));
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.MEMBER.id))).toMatchObject({ ok: false, reason: "duplicate" });
    const ev2 = await makeEvent(w.orgA.id, { title: "Two" });
    const results = await Promise.all(Array.from({ length: 6 }, () => recordOfficerScan(officer, ev2.session.id, makeMemberQr(w.a.MEMBER.id))));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.attendanceRecord.count({ where: { sessionId: ev2.session.id } })).toBe(1);
  });

  it("requires an activated, published, open, non-finalized session", async () => {
    const w = await makeWorld();
    const officer = await auth(w.a.OFFICER.id);
    const qr = () => makeMemberQr(w.a.MEMBER.id);
    const inactive = await makeEvent(w.orgA.id, { active: false });
    const before = await makeEvent(w.orgA.id, { opens: new Date(Date.now() + 3600_000), closes: new Date(Date.now() + 7200_000), startsAt: new Date(Date.now() + 4000_000), endsAt: new Date(Date.now() + 7200_000) });
    const after = await makeEvent(w.orgA.id, { opens: new Date(Date.now() - 7200_000), closes: new Date(Date.now() - 3600_000), startsAt: new Date(Date.now() - 7000_000), endsAt: new Date(Date.now() - 3600_000) });
    const draft = await makeEvent(w.orgA.id, { status: "DRAFT" });
    const cancelled = await makeEvent(w.orgA.id, { status: "CANCELLED" });
    expect(await recordOfficerScan(officer, inactive.session.id, qr())).toMatchObject({ reason: "inactive" });
    for (const e of [before, after, draft, cancelled]) expect(await recordOfficerScan(officer, e.session.id, qr())).toMatchObject({ ok: false, reason: "closed" });
    const done = await makeEvent(w.orgA.id);
    await db.eventSession.update({ where: { id: done.session.id }, data: { finalizedAt: new Date() } });
    expect(await recordOfficerScan(officer, done.session.id, qr())).toMatchObject({ reason: "finalized" });
    expect(await db.attendanceRecord.count()).toBe(0);
  });

  it("rejects expired/forged codes and people who are not expected attendees", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    const officer = await auth(w.a.OFFICER.id);
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.MEMBER.id, Date.now() - 10 * 60_000))).toMatchObject({ reason: "expired" });
    expect(await recordOfficerScan(officer, ev.session.id, "tpk1.garbage")).toMatchObject({ reason: "invalid" });
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.memberB.id))).toMatchObject({ reason: "not_eligible" }); // member of another organization
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.nobody.id))).toMatchObject({ reason: "not_eligible" });
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.ADVISER.id))).toMatchObject({ reason: "not_eligible" }); // advisers are not student attendees
    await db.organizationMember.updateMany({ where: { userId: w.a.MEMBER.id }, data: { endedAt: new Date() } });
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.MEMBER.id))).toMatchObject({ reason: "not_eligible" });
    expect(await db.attendanceRecord.count()).toBe(0);
  });

  it("only scanning roles of the session's organization can scan; the answer never reveals other organizations' sessions", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    const extra = await makeUser(); await addMembership(extra.id, w.orgA.id, "MEMBER");
    const results: Record<string, boolean> = {};
    for (const r of ROLES) {
      await db.attendanceRecord.deleteMany();
      const res = await recordOfficerScan(await auth(w.a[r].id), ev.session.id, makeMemberQr(extra.id));
      results[r] = res.ok;
      if (!res.ok) expect(res.reason).toBe("not_found");
    }
    expect(results).toEqual({ PRESIDENT: true, SECRETARY: true, TREASURER: false, AUDITOR: false, OFFICER: true, ADVISER: false, MEMBER: false });
    for (const id of [w.presidentB.id, w.admin.id, w.nobody.id]) expect(await recordOfficerScan(await auth(id), ev.session.id, makeMemberQr(extra.id))).toMatchObject({ reason: "not_found" });
  });

  it("the scan action needs a signed-in user and validates input", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await expect(scanAttendanceAction(ev.session.id, makeMemberQr(w.a.MEMBER.id))).rejects.toThrow("NEXT_REDIRECT:/login");
    await signInAs(w.a.OFFICER.id);
    expect(await scanAttendanceAction("not-a-uuid", "x".repeat(20))).toMatchObject({ ok: false, reason: "invalid" });
    expect((await scanAttendanceAction(ev.session.id, makeMemberQr(w.a.MEMBER.id))).ok).toBe(true);
  });
});

describe("Method B: QR self check-in", () => {
  it("checks a student in with the session QR using their own account", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    expect(await selfCheckIn(w.a.MEMBER.id, makeSessionQr(ev.session.id))).toMatchObject({ ok: true, status: "PRESENT" });
    expect(await db.attendanceRecord.findFirstOrThrow()).toMatchObject({ userId: w.a.MEMBER.id, source: "QR_SELF", scannedById: null });
    expect(await selfCheckIn(w.a.MEMBER.id, makeSessionQr(ev.session.id))).toMatchObject({ reason: "duplicate" });
  });

  it("rejects expired/invalid codes, ineligible people and inactive sessions", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    expect(await selfCheckIn(w.a.MEMBER.id, makeSessionQr(ev.session.id, 0, Date.now() - 10 * 60_000))).toMatchObject({ reason: "expired" });
    expect(await selfCheckIn(w.a.MEMBER.id, "tpks1.nonsense")).toMatchObject({ reason: "invalid" });
    expect(await selfCheckIn(w.memberB.id, makeSessionQr(ev.session.id))).toMatchObject({ reason: "not_eligible" });
    expect(await selfCheckIn(w.nobody.id, makeSessionQr(ev.session.id))).toMatchObject({ reason: "not_eligible" });
    await db.eventSession.update({ where: { id: ev.session.id }, data: { active: false } });
    expect(await selfCheckIn(w.a.MEMBER.id, makeSessionQr(ev.session.id))).toMatchObject({ reason: "inactive" });
    expect(await db.attendanceRecord.count()).toBe(0);
  });

  it("the action requires sign-in and uses the signed-in user, never a client-supplied id", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await expect(selfCheckInAction(makeSessionQr(ev.session.id))).rejects.toThrow("NEXT_REDIRECT:/login");
    await signInAs(w.a.TREASURER.id);
    expect((await selfCheckInAction(makeSessionQr(ev.session.id))).ok).toBe(true);
    expect((await db.attendanceRecord.findFirstOrThrow()).userId).toBe(w.a.TREASURER.id);
  });

  describe("venue only, session-bound QR (no GPS)", () => {
    it("never asks for or validates location; the venue is just displayed", async () => {
      const w = await makeWorld();
      const ev = await makeEvent(w.orgA.id);
      expect(ev.venue).toBe("Gym");
      expect(await selfCheckIn(w.a.MEMBER.id, makeSessionQr(ev.session.id, ev.session.qrEpoch))).toMatchObject({ ok: true });
    });

    it("rejects a token for a different session than the one selected", async () => {
      const w = await makeWorld();
      const e1 = await makeEvent(w.orgA.id);
      const e2 = await makeEvent(w.orgA.id, { title: "Other" });
      const res = await selfCheckIn(w.a.MEMBER.id, makeSessionQr(e1.session.id, e1.session.qrEpoch), { selectedSessionId: e2.session.id });
      expect(res).toMatchObject({ ok: false, reason: "wrong_session" });
      expect(await db.attendanceRecord.count()).toBe(0);
    });

    it("revoking the session QR invalidates already-issued tokens, and a new token works", async () => {
      const w = await makeWorld();
      const ev = await makeEvent(w.orgA.id);
      const old = makeSessionQr(ev.session.id, ev.session.qrEpoch);
      expect(await revokeSessionQr(await auth(w.a.MEMBER.id), ev.session.id)).toMatchObject({ ok: false });
      expect(await revokeSessionQr(await auth(w.a.OFFICER.id), ev.session.id)).toMatchObject({ ok: true });
      expect(await selfCheckIn(w.a.MEMBER.id, old)).toMatchObject({ ok: false, reason: "revoked" });
      const fresh = await db.eventSession.findUniqueOrThrow({ where: { id: ev.session.id } });
      expect(await selfCheckIn(w.a.MEMBER.id, makeSessionQr(ev.session.id, fresh.qrEpoch))).toMatchObject({ ok: true });
    });

    it("allows separate sessions and events on the same day but rejects duplicates per session", async () => {
      const w = await makeWorld();
      const e1 = await makeEvent(w.orgA.id);
      const e2 = await makeEvent(w.orgA.id, { title: "Second" });
      expect(await selfCheckIn(w.a.MEMBER.id, makeSessionQr(e1.session.id))).toMatchObject({ ok: true });
      expect(await selfCheckIn(w.a.MEMBER.id, makeSessionQr(e2.session.id))).toMatchObject({ ok: true });
      expect(await selfCheckIn(w.a.MEMBER.id, makeSessionQr(e1.session.id))).toMatchObject({ ok: false });
      expect(await db.attendanceRecord.count()).toBe(2);
    });

    it("blocks members of another organization", async () => {
      const w = await makeWorld();
      const ev = await makeEvent(w.orgA.id);
      expect(await selfCheckIn(w.memberB.id, makeSessionQr(ev.session.id))).toMatchObject({ ok: false, reason: "not_eligible" });
    });
  });
});

describe("Method A: RFID", () => {
  async function setup() {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await db.studentProfile.create({ data: { userId: w.a.MEMBER.id, studentNumber: "2024-0001", rfidUid: "04A1B2C3" } });
    const reg = await registerDevice(w.a.PRESIDENT.id, w.orgA.id, "Gate 1");
    if (!reg.ok) throw new Error(reg.error);
    return { w, ev, key: reg.key };
  }
  const post = (key: string | null, body: unknown) =>
    rfidRoute(new Request("http://x/api/rfid/scan", { method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) }));

  it("stores only a hash of the device key and registers devices for device managers only", async () => {
    const { key, w } = await setup();
    const row = await db.scannerDevice.findFirstOrThrow();
    expect(row.keyHash).not.toContain(key);
    expect(JSON.stringify(row)).not.toContain(key);
    for (const r of ["TREASURER", "AUDITOR", "OFFICER", "ADVISER", "MEMBER"] as const) {
      await signInAs(w.a[r].id);
      await expect(registerDeviceAction({}, form({ organizationId: w.orgA.id, name: `d-${r}` }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.a.SECRETARY.id);
    expect((await registerDeviceAction({}, form({ organizationId: w.orgA.id, name: "Gate 2" }))).key).toMatch(/^tpd_/);
    expect((await registerDeviceAction({}, form({ organizationId: w.orgA.id, name: "Gate 2" }))).error).toMatch(/already exists/);
  });

  it("records a card tap through the endpoint, with duplicate protection", async () => {
    const { key, ev, w } = await setup();
    const ok = await post(key, { sessionId: ev.session.id, cardUid: "04a1b2c3" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, status: "PRESENT", name: w.a.MEMBER.firstName });
    expect(await db.attendanceRecord.findFirstOrThrow()).toMatchObject({ source: "RFID", userId: w.a.MEMBER.id, scannedById: null });
    expect(await (await post(key, { sessionId: ev.session.id, cardUid: "04A1B2C3" })).json()).toMatchObject({ ok: false, code: "duplicate" });
    expect(await db.attendanceRecord.count()).toBe(1);
    expect((await db.scannerDevice.findFirstOrThrow()).lastSeenAt).not.toBeNull();
  });

  it("rejects unknown devices, revoked devices, bad bodies, unknown cards and other organizations' sessions", async () => {
    const { key, ev, w } = await setup();
    expect((await post(null, { sessionId: ev.session.id, cardUid: "04A1B2C3" })).status).toBe(401);
    expect((await post("tpd_wrong", { sessionId: ev.session.id, cardUid: "04A1B2C3" })).status).toBe(401);
    expect((await post(key, { sessionId: "x", cardUid: "zz" })).status).toBe(400);
    expect(await (await post(key, { sessionId: ev.session.id, cardUid: "DEADBEEF" })).json()).toMatchObject({ code: "unknown_card" });

    const evB = await makeEvent(w.orgB.id, { title: "B event" });
    await db.studentProfile.create({ data: { userId: w.memberB.id, studentNumber: "2024-0002", rfidUid: "0B0B0B0B" } });
    expect(await (await post(key, { sessionId: evB.session.id, cardUid: "0B0B0B0B" })).json()).toMatchObject({ code: "not_found" }); // device belongs to org A
    expect(await rfidTap({ id: "x", organizationId: w.orgA.id }, evB.session.id, "0B0B0B0B")).toMatchObject({ reason: "not_found" });

    const device = await authenticateDevice(key);
    await revokeDevice(w.a.PRESIDENT.id, device!.id);
    expect((await post(key, { sessionId: ev.session.id, cardUid: "04A1B2C3" })).status).toBe(401);
    expect(await db.attendanceRecord.count()).toBe(0);
  });

  it("applies the same eligibility rules as every other method", async () => {
    const { key, ev, w } = await setup();
    await db.studentProfile.create({ data: { userId: w.a.ADVISER.id, studentNumber: "FAC-1", rfidUid: "AAAA1111" } });
    expect(await (await post(key, { sessionId: ev.session.id, cardUid: "AAAA1111" })).json()).toMatchObject({ code: "not_eligible" });
    await db.eventSession.update({ where: { id: ev.session.id }, data: { active: false } });
    expect(await (await post(key, { sessionId: ev.session.id, cardUid: "04A1B2C3" })).json()).toMatchObject({ code: "inactive" });
  });
});

describe("targets", () => {
  it("filtered events expect only students matching a group in the event's semester", async () => {
    const w = await makeWorld();
    const sy = await db.schoolYear.create({ data: { label: "2025-2026", startsOn: new Date("2025-06-01Z"), endsOn: new Date("2026-05-31Z"), active: true } });
    const sem = await db.semester.create({ data: { schoolYearId: sy.id, name: "1st", sequence: 1, startsOn: new Date("2025-06-01Z"), endsOn: new Date("2025-10-31Z"), active: true } });
    const col = await db.college.create({ data: { code: "CAS", name: "CAS" } });
    const dep = await db.department.create({ data: { collegeId: col.id, code: "CS", name: "CS" } });
    const bsit = await db.program.create({ data: { departmentId: dep.id, code: "BSIT", name: "IT" } });
    const bscs = await db.program.create({ data: { departmentId: dep.id, code: "BSCS", name: "CS" } });
    const enroll = (userId: string, programId: string, yearLevel: number) => db.studentEnrollment.create({ data: { userId, semesterId: sem.id, programId, yearLevel } });
    await enroll(w.a.MEMBER.id, bsit.id, 1);
    await enroll(w.a.TREASURER.id, bsit.id, 2);
    await enroll(w.a.OFFICER.id, bscs.id, 1);

    const ev = await makeEvent(w.orgA.id, { targetMode: "FILTERED", semesterId: sem.id });
    await db.eventTarget.create({ data: { eventId: ev.id, programId: bsit.id, yearLevel: 1 } });
    const officer = await auth(w.a.OFFICER.id);
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.MEMBER.id))).toMatchObject({ ok: true }); // BSIT year 1
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.TREASURER.id))).toMatchObject({ reason: "not_eligible" }); // BSIT year 2
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.AUDITOR.id))).toMatchObject({ reason: "not_eligible" }); // no enrollment

    await db.eventTarget.create({ data: { eventId: ev.id, collegeId: col.id, departmentId: dep.id } }); // OR another group: the whole CS department
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.TREASURER.id))).toMatchObject({ ok: true });
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.OFFICER.id))).toMatchObject({ ok: true });
    expect(await recordOfficerScan(officer, ev.session.id, makeMemberQr(w.a.AUDITOR.id))).toMatchObject({ reason: "not_eligible" });

    // all three targeted students attended, so finalizing creates no absences for the untargeted members
    expect(await finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id)).toEqual({ ok: true, absent: 0 });
    expect(await db.attendanceRecord.count({ where: { status: "ABSENT" } })).toBe(0);
  });

  it("a filtered event with no groups expects nobody", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id, { targetMode: "FILTERED" });
    expect(await recordOfficerScan(await auth(w.a.OFFICER.id), ev.session.id, makeMemberQr(w.a.MEMBER.id))).toMatchObject({ reason: "not_eligible" });
    expect(await finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id)).toEqual({ ok: true, absent: 0 });
  });
});

describe("closing sessions, absences and corrections", () => {
  it("finalizing marks only expected attendees without a record Absent, never advisers, and is not repeatable", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await recordOfficerScan(await auth(w.a.OFFICER.id), ev.session.id, makeMemberQr(w.a.MEMBER.id));
    const president = await auth(w.a.PRESIDENT.id);
    // expected: PRESIDENT, SECRETARY, TREASURER, AUDITOR, OFFICER, MEMBER (6 students) minus the one who attended = 5; the ADVISER is excluded
    expect(await finalizeSession(president, ev.session.id)).toEqual({ ok: true, absent: 5 });
    const rows = await db.attendanceRecord.findMany({ where: { sessionId: ev.session.id } });
    expect(rows.filter((r) => r.status === "ABSENT").map((r) => r.userId)).not.toContain(w.a.ADVISER.id);
    expect(rows.filter((r) => r.status === "ABSENT").every((r) => r.source === "SYSTEM")).toBe(true);
    const session = await db.eventSession.findUniqueOrThrow({ where: { id: ev.session.id } });
    expect(session).toMatchObject({ active: false, finalizedById: w.a.PRESIDENT.id });
    expect(session.finalizedAt).not.toBeNull();
    expect(await finalizeSession(president, ev.session.id)).toMatchObject({ ok: false });
    expect(await db.attendanceRecord.count({ where: { sessionId: ev.session.id } })).toBe(6);
    expect(await db.auditLog.count({ where: { action: "session.finalize" } })).toBe(1);
  });

  it("two simultaneous finalizations produce one set of absences", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    const results = await Promise.all([finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id), finalizeSession(await auth(w.a.SECRETARY.id), ev.session.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.attendanceRecord.count({ where: { sessionId: ev.session.id } })).toBe(6);
  });

  it("only president/secretary finalize; officers can operate the scanner but not close the session", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    for (const id of [w.a.OFFICER.id, w.a.TREASURER.id, w.a.ADVISER.id, w.a.MEMBER.id, w.presidentB.id, w.admin.id]) {
      expect(await finalizeSession(await auth(id), ev.session.id)).toMatchObject({ ok: false });
    }
    expect((await db.eventSession.findUniqueOrThrow({ where: { id: ev.session.id } })).finalizedAt).toBeNull();
    expect(await setSessionActive(await auth(w.a.OFFICER.id), ev.session.id, false)).toEqual({ ok: true });
    expect(await setSessionActive(await auth(w.a.MEMBER.id), ev.session.id, true)).toMatchObject({ ok: false });
    expect(await setSessionActive(await auth(w.presidentB.id), ev.session.id, true)).toMatchObject({ ok: false });
    expect((await finalizeSession(await auth(w.a.SECRETARY.id), ev.session.id)).ok).toBe(true);
  });

  it("manual entry needs a remark, the right authority, an expected attendee, and records the operator", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    const secretary = await auth(w.a.SECRETARY.id);
    expect(await manualEntry(secretary, ev.session.id, w.a.MEMBER.id, "PRESENT", "")).toMatchObject({ ok: false });
    expect(await manualEntry(await auth(w.a.OFFICER.id), ev.session.id, w.a.MEMBER.id, "PRESENT", "forgot card")).toMatchObject({ ok: false });
    expect(await manualEntry(secretary, ev.session.id, w.memberB.id, "PRESENT", "wrong org")).toMatchObject({ ok: false });
    expect(await manualEntry(secretary, ev.session.id, w.a.MEMBER.id, "PRESENT", "Forgot ID card")).toEqual({ ok: true });
    expect(await db.attendanceRecord.findFirstOrThrow()).toMatchObject({ source: "MANUAL", scannedById: w.a.SECRETARY.id, remark: "Forgot ID card" });
    expect(await manualEntry(secretary, ev.session.id, w.a.MEMBER.id, "PRESENT", "again")).toMatchObject({ ok: false }); // duplicate
  });

  it("corrections keep the operator and before/after in the audit trail; only the right roles can excuse", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id);
    const rec = await db.attendanceRecord.findFirstOrThrow({ where: { userId: w.a.MEMBER.id } });
    expect(rec.status).toBe("ABSENT");

    expect(await adjustAttendance(await auth(w.a.OFFICER.id), rec.id, "EXCUSED", "medical")).toMatchObject({ ok: false });
    expect(await adjustAttendance(await auth(w.a.MEMBER.id), rec.id, "PRESENT", "me")).toMatchObject({ ok: false });
    expect(await adjustAttendance(await auth(w.presidentB.id), rec.id, "EXCUSED", "x")).toMatchObject({ ok: false });
    // the Adviser is read-only: no corrections and no excuses
    expect(await adjustAttendance(await auth(w.a.ADVISER.id), rec.id, "PRESENT", "adviser")).toMatchObject({ ok: false });
    expect(await adjustAttendance(await auth(w.a.ADVISER.id), rec.id, "EXCUSED", "Medical certificate")).toMatchObject({ ok: false });
    expect((await db.attendanceRecord.findUniqueOrThrow({ where: { id: rec.id } })).status).toBe("ABSENT");
    expect(await adjustAttendance(await auth(w.a.SECRETARY.id), rec.id, "EXCUSED", "")).toMatchObject({ ok: false }); // remark required
    expect(await adjustAttendance(await auth(w.a.SECRETARY.id), rec.id, "EXCUSED", "Medical certificate")).toEqual({ ok: true });

    expect(await db.attendanceRecord.findUniqueOrThrow({ where: { id: rec.id } })).toMatchObject({ status: "EXCUSED", modifiedById: w.a.SECRETARY.id, remark: "Medical certificate" });
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "attendance.adjust" } });
    expect(log.metadata).toMatchObject({ from: "ABSENT", to: "EXCUSED" });
    expect(await adjustAttendance(await auth(w.a.SECRETARY.id), rec.id, "PRESENT", "Arrived late, scanner was offline")).toEqual({ ok: true });
  });

  it("the session roster is visible to oversight roles only, and merges expected attendees with records", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await recordOfficerScan(await auth(w.a.OFFICER.id), ev.session.id, makeMemberQr(w.a.MEMBER.id));
    const view = await getSessionRoster(await auth(w.a.SECRETARY.id), ev.session.id);
    expect(view?.rows).toHaveLength(6);
    expect(view?.rows.filter((r) => r.record).length).toBe(1);
    for (const id of [w.a.MEMBER.id, w.a.TREASURER.id, w.presidentB.id, w.admin.id]) expect(await getSessionRoster(await auth(id), ev.session.id)).toBeNull();
  });
});
