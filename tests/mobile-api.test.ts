import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/mobile/login/route";
import { POST as logout } from "@/app/api/mobile/logout/route";
import { GET as meGet, PATCH as mePatch } from "@/app/api/mobile/me/route";
import { GET as homeGet } from "@/app/api/mobile/home/route";
import { GET as eventsGet } from "@/app/api/mobile/events/route";
import { GET as eventGet } from "@/app/api/mobile/events/[id]/route";
import { GET as scanSessions } from "@/app/api/mobile/scan/sessions/route";
import { POST as scanPost } from "@/app/api/mobile/scan/route";
import { GET as feesGet } from "@/app/api/mobile/fees/route";
import { GET as orgsGet } from "@/app/api/mobile/organizations/route";
import { GET as notesGet, POST as notesPost } from "@/app/api/mobile/notifications/route";
import { GET as announcementsGet } from "@/app/api/mobile/announcements/route";
import { GET as attendanceGet } from "@/app/api/mobile/attendance/route";
import { makeSessionQr } from "@/features/attendance/qr";
import { db, makeUser, TEST_PASSWORD } from "./helpers/db";
import { makeEvent, makeWorld } from "./helpers/world";

const URL0 = "http://localhost/api/mobile";
const req = (path: string, token?: string | null, init: RequestInit = {}) =>
  new Request(`${URL0}${path}`, { ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
const body = (r: Response) => r.json() as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const none = { params: Promise.resolve({}) };

async function signIn(email: string, password = TEST_PASSWORD) {
  const res = await login(req("/login", null, { method: "POST", body: JSON.stringify({ email, password }) }));
  return { res, data: await body(res) };
}
async function tokenFor(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const { res, data } = await signIn(u.email);
  expect(res.status, JSON.stringify(data)).toBe(200);
  return data.token as string;
}

describe("mobile API: sign-in and tokens", () => {
  it("signs in with the web account, stores only a hash, and rejects bad credentials the same way as the web", async () => {
    const w = await makeWorld();
    const member = await db.user.findUniqueOrThrow({ where: { id: w.a.MEMBER.id } });
    const { res, data } = await signIn(member.email);
    expect(res.status).toBe(200);
    expect(data.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const stored = await db.session.findFirstOrThrow({ where: { userId: member.id } });
    expect(stored.tokenHash).not.toBe(data.token); // only a hash is stored
    expect(stored.userAgent).toMatch(/^mobile:/);

    const bad = await signIn(member.email, "wrong-password");
    expect(bad.res.status).toBe(401);
    expect(bad.data.error.message).toBe("Invalid email or password.");
    expect((await signIn("nobody@test.local", "x")).data.error.message).toBe("Invalid email or password."); // same answer for unknown emails
    expect((await login(req("/login", null, { method: "POST", body: "not json" }))).status).toBe(400);
  });

  it("locks the account after five failures, exactly like the web", async () => {
    const w = await makeWorld();
    const email = (await db.user.findUniqueOrThrow({ where: { id: w.a.MEMBER.id } })).email;
    for (let i = 0; i < 5; i++) await signIn(email, "nope");
    const locked = await signIn(email); // even the right password is refused while locked
    expect(locked.res.status).toBe(401);
    expect(locked.data.error.message).toMatch(/Too many failed attempts/);
  });

  it("refuses system administrators, invited and deactivated accounts, and never issues them a token", async () => {
    const w = await makeWorld();
    const admin = await db.user.findUniqueOrThrow({ where: { id: w.admin.id } });
    const a = await signIn(admin.email);
    expect(a.res.status).toBe(403);
    expect(a.data.error.code).toBe("ADMIN_WEB_ONLY");
    const invited = await makeUser({ email: "inv@test.local" });
    await db.user.update({ where: { id: invited.id }, data: { status: "INVITED" } });
    expect((await signIn("inv@test.local")).res.status).toBe(401);
    const off = await makeUser({ email: "off@test.local", status: "DISABLED" });
    expect((await signIn(off.email)).res.status).toBe(401);
    expect(await db.session.count({ where: { userId: { in: [admin.id, invited.id, off.id] } } })).toBe(0);
  });

  it("every data route requires a valid token; tokens die on logout, expiry and deactivation; admin tokens are refused", async () => {
    const w = await makeWorld();
    const token = await tokenFor(w.a.MEMBER.id);
    const routes: [string, (r: Request, c: typeof none) => Promise<Response>][] = [
      ["/me", meGet], ["/home", homeGet], ["/events", eventsGet], ["/scan/sessions", scanSessions], ["/fees", feesGet],
      ["/organizations", orgsGet], ["/notifications", notesGet], ["/announcements", announcementsGet], ["/attendance", attendanceGet],
    ];
    for (const [path, handler] of routes) {
      expect((await handler(req(path), none)).status, `${path} without a token`).toBe(401);
      expect((await handler(req(path, "x".repeat(43)), none)).status, `${path} with a made-up token`).toBe(401);
      expect((await handler(req(path, token), none)).status, `${path} with a valid token`).toBe(200);
    }
    // a system administrator who somehow holds a session is still refused on every route
    await db.session.create({ data: { userId: w.admin.id, tokenHash: (await import("@/lib/auth/session")).hashToken("a".repeat(43)), expiresAt: new Date(Date.now() + 3_600_000) } });
    for (const [path, handler] of routes) expect((await handler(req(path, "a".repeat(43)), none)).status, path).toBe(403);

    await db.session.updateMany({ where: { userId: w.a.MEMBER.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await meGet(req("/me", token), none)).status).toBe(401); // expired
    const t2 = await tokenFor(w.a.MEMBER.id);
    expect((await meGet(req("/me", t2), none)).status).toBe(200);
    await db.user.update({ where: { id: w.a.MEMBER.id }, data: { status: "DISABLED" } });
    expect((await meGet(req("/me", t2), none)).status).toBe(401); // deactivated
    await db.user.update({ where: { id: w.a.MEMBER.id }, data: { status: "ACTIVE" } });
    expect((await logout(req("/logout", t2, { method: "POST" }))).status).toBe(200);
    expect((await meGet(req("/me", t2), none)).status).toBe(401); // signed out on the server
  });
});

describe("mobile API: member data, scoped to the signed-in member", () => {
  it("profile shows positions per organization and a student may edit only contact fields", async () => {
    const w = await makeWorld();
    await db.studentProfile.create({ data: { userId: w.a.MEMBER.id, studentNumber: "2026-0001", yearLevel: 2, contactNumber: "09171234567" } });
    const token = await tokenFor(w.a.MEMBER.id);
    const me = await body(await meGet(req("/me", token), none));
    expect(me.student).toMatchObject({ studentNumber: "2026-0001", yearLevel: 2 });
    expect(me.memberships).toEqual([expect.objectContaining({ organization: "Org A", role: "MEMBER" })]);
    expect(JSON.stringify(me)).not.toMatch(/passwordHash|tokenHash|systemRole/);

    const ok = await mePatch(req("/me", token, { method: "PATCH", body: JSON.stringify({ contactNumber: "09181234567", streetAddress: "5 Mabini St", middleName: "" }) }), none);
    expect(ok.status).toBe(200);
    expect((await db.studentProfile.findUniqueOrThrow({ where: { userId: w.a.MEMBER.id } })).contactNumber).toBe("09181234567");
    // forged privileged / protected fields are ignored; bad formats are rejected
    await mePatch(req("/me", token, { method: "PATCH", body: JSON.stringify({ studentNumber: "HACK-1", systemRole: "SYSTEM_ADMIN", programId: "x" }) }), none);
    expect(await db.studentProfile.findUniqueOrThrow({ where: { userId: w.a.MEMBER.id } })).toMatchObject({ studentNumber: "2026-0001" });
    expect((await db.user.findUniqueOrThrow({ where: { id: w.a.MEMBER.id } })).systemRole).toBe("USER");
    expect((await mePatch(req("/me", token, { method: "PATCH", body: JSON.stringify({ contactNumber: "123" }) }), none)).status).toBe(400);
  });

  it("events: published events of my own organizations only; drafts and other organizations are hidden", async () => {
    const w = await makeWorld();
    const mine = await makeEvent(w.orgA.id, { title: "Mine" });
    const draft = await makeEvent(w.orgA.id, { title: "Draft", status: "DRAFT" });
    const theirs = await makeEvent(w.orgB.id, { title: "Theirs" });
    const token = await tokenFor(w.a.MEMBER.id);
    const list = await body(await eventsGet(req("/events", token), none));
    expect(list.events.map((e: { title: string }) => e.title)).toEqual(["Mine"]);
    // even an officer who can see drafts on the web does not get them on mobile
    const officer = await tokenFor(w.a.OFFICER.id);
    expect((await body(await eventsGet(req("/events", officer), none))).events.map((e: { title: string }) => e.title)).toEqual(["Mine"]);

    const detail = await eventGet(req(`/events/${mine.id}`, token), { params: Promise.resolve({ id: mine.id }) });
    expect(detail.status).toBe(200);
    expect((await body(detail)).sessions).toHaveLength(1);
    for (const id of [draft.id, theirs.id, "not-a-uuid"]) expect((await eventGet(req(`/events/${id}`, token), { params: Promise.resolve({ id }) })).status).toBe(404);
  });

  it("scan: checks in the signed-in member to the chosen session and reports every failure; no one can check in someone else", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id, { sessions: 2 });
    const token = await tokenFor(w.a.MEMBER.id);
    const list = await body(await scanSessions(req("/scan/sessions", token), none));
    expect(list.sessions.map((s: { id: string }) => s.id).sort()).toEqual(ev.sessions.map((s) => s.id).sort());
    expect(list.sessions[0].state).toBe("open");

    const scan = async (code: string, sessionId?: string, t = token) => body(await scanPost(req("/scan", t, { method: "POST", body: JSON.stringify({ code, sessionId }) }), none));
    const [s1, s2] = ev.sessions;
    expect(await scan(makeSessionQr(s1.id, s1.qrEpoch), s2.id)).toMatchObject({ ok: false, reason: "wrong_session" });
    expect(await scan("garbage-garbage-garbage-garbage")).toMatchObject({ ok: false, reason: "invalid" });
    expect(await scan(makeSessionQr(s1.id, s1.qrEpoch), s1.id)).toMatchObject({ ok: true });
    expect(await scan(makeSessionQr(s1.id, s1.qrEpoch), s1.id)).toMatchObject({ ok: false, reason: "duplicate" });
    expect(await scan(makeSessionQr(s2.id, s2.qrEpoch), s2.id)).toMatchObject({ ok: true }); // other session, same day
    const rec = await db.attendanceRecord.findMany({ where: { userId: w.a.MEMBER.id } });
    expect(rec.map((r) => r.source)).toEqual(["QR_SELF", "QR_SELF"]);
    // a member of another organization is not eligible
    const other = await tokenFor(w.memberB.id);
    expect(await scan(makeSessionQr(s1.id, s1.qrEpoch), s1.id, other)).toMatchObject({ ok: false, reason: "not_eligible" });
    expect((await body(await attendanceGet(req("/attendance", token), none))).records).toHaveLength(2);
    expect((await body(await attendanceGet(req("/attendance", other), none))).records).toHaveLength(0);
  });

  it("fees: only my own assessments, with derived balances; no organization-wide data", async () => {
    const w = await makeWorld();
    const ft = await db.feeType.create({ data: { organizationId: w.orgA.id, name: "Dues", amount: 100 } });
    const mine = await db.studentFee.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, feeTypeId: ft.id, title: "Dues", amountDue: 100 } });
    await db.studentFee.create({ data: { organizationId: w.orgA.id, userId: w.a.OFFICER.id, feeTypeId: ft.id, title: "Dues", amountDue: 100 } });
    await db.payment.create({ data: { studentFeeId: mine.id, amount: 40, method: "CASH", status: "CONFIRMED", receiptCode: "TPK-TEST-0001" } });
    await db.payment.create({ data: { studentFeeId: mine.id, amount: 20, method: "GCASH", status: "PENDING", receiptCode: "TPK-TEST-0002", reference: "R1" } });
    const token = await tokenFor(w.a.MEMBER.id);
    const data = await body(await feesGet(req("/fees", token), none));
    expect(data.fees).toHaveLength(1);
    expect(data.fees[0]).toMatchObject({ amountDue: "100.00", paid: "40.00", pending: "20.00", balance: "60.00", status: "PARTIAL" });
    // the treasurer sees only their own personal fees here, not the organization ledger
    const treasurer = await tokenFor(w.a.TREASURER.id);
    expect((await body(await feesGet(req("/fees", treasurer), none))).fees).toHaveLength(0);
  });

  it("notifications are private and can be marked read; announcements follow audience rules; organizations list my positions", async () => {
    const w = await makeWorld();
    await db.notification.create({ data: { userId: w.a.MEMBER.id, kind: "x", title: "Hello" } });
    await db.notification.create({ data: { userId: w.a.OFFICER.id, kind: "x", title: "Not yours" } });
    await db.announcement.create({ data: { organizationId: w.orgA.id, title: "Welcome", body: "Hi all", status: "PUBLISHED", publishedAt: new Date() } });
    await db.announcement.create({ data: { organizationId: w.orgA.id, title: "Draft one", body: "x", status: "DRAFT" } });
    await db.announcement.create({ data: { organizationId: w.orgB.id, title: "Other org", body: "x", status: "PUBLISHED", publishedAt: new Date() } });
    const token = await tokenFor(w.a.MEMBER.id);
    const notes = (await body(await notesGet(req("/notifications", token), none))).notifications;
    expect(notes.map((n: { title: string }) => n.title)).toEqual(["Hello"]);
    expect(notes[0].read).toBe(false);
    // marking someone else's notification does nothing
    const theirs = await db.notification.findFirstOrThrow({ where: { userId: w.a.OFFICER.id } });
    await notesPost(req("/notifications", token, { method: "POST", body: JSON.stringify({ action: "read", id: theirs.id }) }), none);
    expect((await db.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
    await notesPost(req("/notifications", token, { method: "POST", body: JSON.stringify({ action: "read_all" }) }), none);
    expect((await body(await notesGet(req("/notifications", token), none))).notifications[0].read).toBe(true);

    expect((await body(await announcementsGet(req("/announcements", token), none))).announcements.map((a: { title: string }) => a.title)).toEqual(["Welcome"]);
    const orgs = (await body(await orgsGet(req("/organizations", token), none))).organizations;
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({ name: "Org A", positions: [{ role: "MEMBER" }] });
    expect(JSON.stringify(orgs)).not.toMatch(/email|firstName/); // headcount only, no member details

    const home = await body(await homeGet(req("/home", token), none));
    expect(home).toMatchObject({ unread: 0, balanceDue: "0.00" });
    expect(home.announcements).toHaveLength(1);
  });
});
