import { describe, expect, it } from "vitest";
import { POST as rfidRoute } from "@/app/api/rfid/scan/route";
import { POST as login } from "@/app/api/mobile/login/route";
import { GET as liveGet } from "@/app/api/mobile/org/[orgId]/sessions/[sessionId]/live/route";
import { GET as photoGet } from "@/app/api/mobile/org/[orgId]/members/[userId]/photo/route";
import { registerDevice } from "@/features/attendance/devices";
import { liveSession, monitorableSessions } from "@/features/attendance/live";
import { liveSessionAction } from "@/features/attendance/live-actions";
import { startRfidEnrollmentAction } from "@/features/users/rfid-actions";
import { formatTimeSeconds } from "@/lib/format";
import { db, signInAs } from "./helpers/db";
import { auth, makeEvent, makeWorld } from "./helpers/world";

const tap = (key: string, cardUid: string, sessionId?: string) =>
  rfidRoute(new Request("http://x/api/rfid/scan", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ cardUid, ...(sessionId ? { sessionId } : {}) }) }));
const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
const req = (token: string) => new Request("http://localhost/api/mobile/x", { headers: { authorization: `Bearer ${token}` } });
async function tokenFor(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const res = await login(new Request("http://localhost/api/mobile/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: "TestPassword1!" }) }));
  return (await res.json()).token as string;
}

async function setup() {
  const w = await makeWorld();
  const program = await db.program.create({ data: { code: "P1", name: "Program One", department: { create: { code: "D", name: "Dept", college: { create: { code: "C", name: "College" } } } } } });
  await db.user.update({ where: { id: w.a.MEMBER.id }, data: { firstName: "Juan", lastName: "Dela Cruz" } });
  await db.studentProfile.create({ data: { userId: w.a.MEMBER.id, studentNumber: "2026-0001", rfidUid: "04A1B2C3", programId: program.id, yearLevel: 2, photoKey: "photos/juan.jpg" } });
  await db.studentProfile.create({ data: { userId: w.a.OFFICER.id, studentNumber: "2026-0002", rfidUid: "0B0B0B0B" } }); // no photo, no program
  const reg = await registerDevice(w.a.PRESIDENT.id, w.orgA.id, "Gate 1");
  if (!reg.ok) throw new Error("device");
  return { w, key: reg.key };
}

describe("live attendance monitor", () => {
  it("shows a successful tap with the saved record's details, time and totals", async () => {
    const { w, key } = await setup();
    const ev = await makeEvent(w.orgA.id, { title: "General Assembly" });
    expect(await (await tap(key, "04A1B2C3")).json()).toMatchObject({ ok: true, status: "PRESENT" });
    const data = (await liveSession(await auth(w.a.SECRETARY.id), ev.session.id))!;
    const rec = await db.attendanceRecord.findFirstOrThrow();
    expect(data.session.state).toBe("open");
    expect(data.event).toMatchObject({ title: "General Assembly", organizationId: w.orgA.id });
    expect(data.checkIns).toEqual([{
      id: rec.id, userId: w.a.MEMBER.id, name: "Juan Dela Cruz", studentNumber: "2026-0001", program: "P1", yearLevel: 2,
      status: "PRESENT", source: "RFID", at: rec.scannedAt.toISOString(), time: formatTimeSeconds(rec.scannedAt), hasPhoto: true,
    }]);
    expect(data.totals).toMatchObject({ present: 1, late: 0 });
    expect(data.totals.expected).toBeGreaterThanOrEqual(6);
    expect(data.rejections).toEqual([]);
    expect(data.terminals).toEqual([{ name: "Gate 1", lastSeenAt: expect.any(String) }]);
    expect(JSON.stringify(data)).not.toMatch(/tpd_|keyHash|rfidUid|04A1B2C3|photoKey|email/); // no keys, card numbers or private data
  });

  it("marks a late arrival LATE, and a student without a photo or program shows cleanly", async () => {
    const { w, key } = await setup();
    const ev = await makeEvent(w.orgA.id, { startsAt: new Date(Date.now() - 60 * 60_000), opens: new Date(Date.now() - 90 * 60_000), grace: 10 });
    await tap(key, "0B0B0B0B");
    const data = (await liveSession(await auth(w.a.PRESIDENT.id), ev.session.id))!;
    expect(data.checkIns[0]).toMatchObject({ status: "LATE", hasPhoto: false, program: null, yearLevel: null, studentNumber: "2026-0002" });
    expect(data.totals).toMatchObject({ present: 0, late: 1 });
  });

  it("duplicate taps keep one check-in and are listed as not recorded, with the student's name", async () => {
    const { w, key } = await setup();
    const ev = await makeEvent(w.orgA.id);
    await tap(key, "04A1B2C3");
    expect(await (await tap(key, "04A1B2C3")).json()).toMatchObject({ ok: false, code: "duplicate" });
    const data = (await liveSession(await auth(w.a.OFFICER.id), ev.session.id))!;
    expect(data.checkIns).toHaveLength(1);
    expect(new Set(data.checkIns.map((c) => c.id)).size).toBe(1);
    expect(data.rejections).toEqual([expect.objectContaining({ code: "duplicate", message: expect.stringMatching(/Already recorded/), name: "Juan Dela Cruz", studentNumber: "2026-0001", device: "Gate 1" })]);
  });

  it("unknown cards, no open session and several open sessions are shown as not recorded, never as check-ins", async () => {
    const { w, key } = await setup();
    const closed = await makeEvent(w.orgA.id, { active: false });
    await tap(key, "DEADBEEF"); // nothing open at all
    let data = (await liveSession(await auth(w.a.SECRETARY.id), closed.session.id))!;
    expect(data.session.state).toBe("not_activated");
    expect(data.rejections).toEqual([expect.objectContaining({ code: "no_open_session", message: "No attendance session is open.", name: null, cardTail: null })]);

    const ev = await makeEvent(w.orgA.id);
    await tap(key, "DEADBEEF");
    data = (await liveSession(await auth(w.a.SECRETARY.id), ev.session.id))!;
    expect(data.rejections[0]).toMatchObject({ code: "unknown_card", message: expect.stringMatching(/Unknown RFID card/), cardTail: "BEEF", name: null });

    await makeEvent(w.orgA.id, { title: "Second" });
    await tap(key, "04A1B2C3");
    data = (await liveSession(await auth(w.a.SECRETARY.id), ev.session.id))!;
    expect(data.rejections[0]).toMatchObject({ code: "several_open_sessions", name: "Juan Dela Cruz" });
    expect(data.checkIns).toEqual([]);
    expect(await db.attendanceRecord.count()).toBe(0);
  });

  it("registration taps never appear as check-ins or rejections", async () => {
    const { w, key } = await setup();
    const ev = await makeEvent(w.orgA.id);
    const device = await db.scannerDevice.findFirstOrThrow();
    await db.studentProfile.create({ data: { userId: w.a.TREASURER.id, studentNumber: "2026-0003" } });
    await signInAs(w.admin.id);
    const s = await startRfidEnrollmentAction(w.a.TREASURER.id, device.id);
    if ("error" in s) throw new Error(s.error);
    expect(await (await tap(key, "0C0C0C0C")).json()).toMatchObject({ captured: true });
    const data = (await liveSession(await auth(w.a.PRESIDENT.id), ev.session.id))!;
    expect(data.checkIns).toEqual([]);
    expect(data.rejections).toEqual([]);
  });

  it("only positions that may see the organization's attendance can open it, on the web or in the app", async () => {
    const { w, key } = await setup();
    const ev = await makeEvent(w.orgA.id);
    await tap(key, "04A1B2C3");
    for (const id of [w.a.PRESIDENT.id, w.a.SECRETARY.id, w.a.OFFICER.id, w.a.ADVISER.id]) expect(await liveSession(await auth(id), ev.session.id), id).not.toBeNull();
    for (const id of [w.a.TREASURER.id, w.a.AUDITOR.id, w.a.MEMBER.id, w.presidentB.id, w.admin.id]) expect(await liveSession(await auth(id), ev.session.id), id).toBeNull();
    await signInAs(w.presidentB.id);
    expect(await liveSessionAction(ev.session.id)).toBeNull();
    await signInAs(w.a.SECRETARY.id);
    expect((await liveSessionAction(ev.session.id))?.checkIns).toHaveLength(1);
    expect(await liveSessionAction("not-a-uuid")).toBeNull();

    const sec = await tokenFor(w.a.SECRETARY.id);
    expect((await liveGet(req(sec), ctx({ orgId: w.orgA.id, sessionId: ev.session.id }))).status).toBe(200);
    const evB = await makeEvent(w.orgB.id);
    expect((await liveGet(req(sec), ctx({ orgId: w.orgA.id, sessionId: evB.session.id }))).status).toBe(404); // another organization's session
    expect((await liveGet(req(sec), ctx({ orgId: w.orgB.id, sessionId: evB.session.id }))).status).toBe(403);
    expect((await liveGet(req(await tokenFor(w.a.TREASURER.id)), ctx({ orgId: w.orgA.id, sessionId: ev.session.id }))).status).toBe(403);
  });

  it("member photos in the app follow the roster rule; a missing photo is a plain 'not found'", async () => {
    const { w } = await setup();
    const sec = await tokenFor(w.a.SECRETARY.id);
    // the photo file is not on disk in tests: the route answers 404 instead of failing
    expect((await photoGet(req(sec), ctx({ orgId: w.orgA.id, userId: w.a.MEMBER.id }))).status).toBe(404);
    expect((await photoGet(req(sec), ctx({ orgId: w.orgA.id, userId: w.a.OFFICER.id }))).status).toBe(404); // no photo
    expect((await photoGet(req(await tokenFor(w.a.MEMBER.id)), ctx({ orgId: w.orgA.id, userId: w.a.OFFICER.id }))).status).toBe(403); // members cannot
    expect((await photoGet(req(sec), ctx({ orgId: w.orgA.id, userId: w.memberB.id }))).status).toBe(404); // not a member of this organization
  });

  it("offers the sessions to watch, open ones first, and formats times in Philippine time with seconds", async () => {
    const { w } = await setup();
    const open = await makeEvent(w.orgA.id, { title: "Open now" });
    await makeEvent(w.orgA.id, { title: "Not open", active: false });
    await makeEvent(w.orgB.id, { title: "Other org" });
    const list = await monitorableSessions(await auth(w.a.SECRETARY.id));
    expect(list[0]).toMatchObject({ id: open.session.id, open: true });
    expect(list.map((s) => s.event)).toEqual(expect.arrayContaining(["Open now", "Not open"]));
    expect(list.map((s) => s.event)).not.toContain("Other org");
    expect(await monitorableSessions(await auth(w.a.TREASURER.id))).toEqual([]);
    expect(formatTimeSeconds(new Date("2026-10-14T06:05:33Z"))).toBe("2:05:33 PM");
    expect(formatTimeSeconds(new Date("2026-10-14T06:05:33Z"), false)).toBe("2:05 PM");
  });

  it("the web page opens the open session by itself and refuses positions without access", async () => {
    const { w } = await setup();
    const ev = await makeEvent(w.orgA.id);
    const { default: Live } = await import("@/app/(dashboard)/attendance/live/page");
    await signInAs(w.a.SECRETARY.id);
    expect(await Live({ searchParams: Promise.resolve({}) })).toBeTruthy();
    expect(await Live({ searchParams: Promise.resolve({ session: ev.session.id }) })).toBeTruthy();
    expect(await Live({ searchParams: Promise.resolve({ pick: "1" }) })).toBeTruthy();
    await signInAs(w.a.TREASURER.id);
    await expect(Live({ searchParams: Promise.resolve({}) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});
