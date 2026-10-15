import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/mobile/login/route";
import { GET as overviewGet } from "@/app/api/mobile/org/[orgId]/overview/route";
import { GET as financeGet } from "@/app/api/mobile/org/[orgId]/finance/route";
import { POST as decidePayment } from "@/app/api/mobile/org/[orgId]/payments/[paymentId]/route";
import { POST as recordCash } from "@/app/api/mobile/org/[orgId]/fees/[studentFeeId]/payments/route";
import { GET as annList, POST as annPost } from "@/app/api/mobile/org/[orgId]/announcements/route";
import { GET as eventsList, POST as eventPost } from "@/app/api/mobile/org/[orgId]/events/route";
import { POST as eventStatus } from "@/app/api/mobile/org/[orgId]/events/[id]/status/route";
import { POST as sessionToggle } from "@/app/api/mobile/org/[orgId]/events/[id]/sessions/[sessionId]/route";
import { GET as membersGet } from "@/app/api/mobile/org/[orgId]/members/route";
import { GET as docsGet } from "@/app/api/mobile/org/[orgId]/documents/route";
import { GET as memberGet } from "@/app/api/mobile/org/[orgId]/members/[userId]/route";
import { GET as expensesGet, POST as expensePost } from "@/app/api/mobile/org/[orgId]/expenses/route";
import { POST as expenseDecide } from "@/app/api/mobile/org/[orgId]/expenses/[id]/route";
import { GET as memberEvents } from "@/app/api/mobile/events/route";
import { GET as memberAnnouncements } from "@/app/api/mobile/announcements/route";
import { GET as memberNotifications } from "@/app/api/mobile/notifications/route";
import { GET as memberFees } from "@/app/api/mobile/fees/route";
import { GET as me } from "@/app/api/mobile/me/route";
import { hashToken } from "@/lib/auth/session";
import { addMembership, db, makeUser } from "./helpers/db";
import { makeWorld } from "./helpers/world";

const req = (token: string | null, body?: unknown) =>
  new Request("http://localhost/api/mobile/x", {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
const data = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function tokenFor(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const res = await login(new Request("http://localhost/api/mobile/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: "TestPassword1!" }) }));
  expect(res.status).toBe(200);
  return (await res.json()).token as string;
}

/** Org A with a fee of 100 assessed to the member: 40 confirmed, 20 pending, 10 waived => effective due 90, balance 50. */
async function seedFinance(w: Awaited<ReturnType<typeof makeWorld>>) {
  const ft = await db.feeType.create({ data: { organizationId: w.orgA.id, name: "Dues", amount: 100 } });
  const fee = await db.studentFee.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, feeTypeId: ft.id, title: "Dues", amountDue: 100 } });
  await db.ledgerAdjustment.create({ data: { studentFeeId: fee.id, type: "WAIVER", amount: -10, reason: "waived" } });
  await db.payment.create({ data: { studentFeeId: fee.id, amount: 40, method: "CASH", status: "CONFIRMED", receiptCode: "TPK-T-1" } });
  const pending = await db.payment.create({ data: { studentFeeId: fee.id, amount: 20, method: "GCASH", status: "PENDING", receiptCode: "TPK-T-2", reference: "R1" } });
  await db.payment.create({ data: { studentFeeId: fee.id, amount: 15, method: "CASH", status: "CONFIRMED", receiptCode: "TPK-T-3", voidedAt: new Date(), voidReason: "mistake" } }); // voided: must not count
  // another organization's fee must never leak into Org A's totals
  const ftB = await db.feeType.create({ data: { organizationId: w.orgB.id, name: "B dues", amount: 999 } });
  await db.studentFee.create({ data: { organizationId: w.orgB.id, userId: w.memberB.id, feeTypeId: ftB.id, title: "B dues", amountDue: 999 } });
  return { fee, pending };
}

const O = (orgId: string) => ctx({ orgId });

describe("mobile org dashboards: each position gets its own capabilities, enforced on the server", () => {
  it("returns the capability set of the caller's position in that organization", async () => {
    const w = await makeWorld();
    await seedFinance(w);
    const expected = {
      MEMBER: [],
      OFFICER: ["members.basic", "events.manage", "attendance.view_org", "evaluations.results", "evaluations.manage", "obligations.view_org"],
      PRESIDENT: ["members.basic", "members.roster", "joinrequests.review", "events.manage", "attendance.view_org", "announcements.manage", "documents.manage", "fees.view_org", "fees.manage", "reports.finance", "expenses.approve", "evaluations.results", "evaluations.manage", "obligations.view_org"],
      TREASURER: ["members.basic", "fees.view_org", "fees.manage", "reports.finance", "expenses.record"],
      AUDITOR: ["members.basic", "fees.view_org", "reports.finance"],
      SECRETARY: ["members.basic", "members.roster", "joinrequests.review", "events.manage", "attendance.view_org", "announcements.manage", "documents.manage", "evaluations.results", "evaluations.manage", "obligations.view_org"],
    } as const;
    for (const [role, caps] of Object.entries(expected)) {
      const token = await tokenFor(w.a[role as keyof typeof w.a].id);
      const res = await overviewGet(req(token), O(w.orgA.id));
      expect(res.status, role).toBe(200);
      const body = await data(res);
      const on = Object.entries(body.capabilities).filter(([, v]) => v).map(([k]) => k).sort();
      expect(on, role).toEqual([...caps].sort());
      // blocks appear only with their capability
      expect(body.finance !== null, `${role} finance`).toBe(caps.some((c) => c === "fees.view_org"));
      expect(body.members !== null, `${role} members`).toBe(caps.some((c) => c === "members.basic"));
      expect(body.documents !== null, `${role} documents`).toBe(caps.some((c) => c === "documents.manage"));
      expect(body.announcements !== null, `${role} announcements`).toBe(caps.some((c) => c === "announcements.manage"));
    }
  });

  it("finance totals are exact: waivers count, voided and pending payments do not reduce the balance, other organizations are excluded", async () => {
    const w = await makeWorld();
    await seedFinance(w);
    const body = await data(await overviewGet(req(await tokenFor(w.a.TREASURER.id)), O(w.orgA.id)));
    expect(body.finance).toMatchObject({ assessed: "90.00", collected: "40.00", pendingVerification: "20.00", outstanding: "50.00", collectionRate: 44, pendingCount: 1, membersWithBalance: 1 });
    expect(body.finance.recent).toHaveLength(2); // confirmed + pending; the voided one is not listed
    // chart series: six months, this month holds exactly the confirmed, non-voided money
    expect(body.finance.byMonth).toHaveLength(6);
    expect(body.finance.byMonth[5].value).toBe("40.00");
    expect(body.finance.byMonth.slice(0, 5).every((m: { value: string }) => m.value === "0.00")).toBe(true);
    const fin = await data(await financeGet(req(await tokenFor(w.a.TREASURER.id)), O(w.orgA.id)));
    expect(fin.canManage).toBe(true);
    expect(fin.owing).toEqual([expect.objectContaining({ balance: "50.00", due: "90.00", paid: "40.00" })]);
    expect(fin.pending).toHaveLength(1);
  });

  it("finance data is refused to roles without fees.view_org, and the auditor is read-only", async () => {
    const w = await makeWorld();
    const { fee, pending } = await seedFinance(w);
    for (const role of ["MEMBER", "OFFICER", "SECRETARY"] as const) {
      expect((await financeGet(req(await tokenFor(w.a[role].id)), O(w.orgA.id))).status, role).toBe(403);
    }
    for (const role of ["PRESIDENT", "TREASURER", "AUDITOR", "ADVISER"] as const) {
      expect((await financeGet(req(await tokenFor(w.a[role].id)), O(w.orgA.id))).status, role).toBe(200);
    }
    const auditor = await tokenFor(w.a.AUDITOR.id);
    expect((await data(await financeGet(req(auditor), O(w.orgA.id)))).canManage).toBe(false);
    // even by calling the write routes directly, nobody without fees.manage can change money
    for (const role of ["AUDITOR", "SECRETARY", "OFFICER", "MEMBER", "ADVISER"] as const) {
      const t = await tokenFor(w.a[role].id);
      expect((await decidePayment(req(t, { decision: "approve" }), ctx({ orgId: w.orgA.id, paymentId: pending.id }))).status, role).toBe(403);
      expect((await recordCash(req(t, { amount: "10", method: "CASH" }), ctx({ orgId: w.orgA.id, studentFeeId: fee.id }))).status, role).toBe(403);
    }
    expect((await db.payment.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("PENDING");
  });

  it("treasurer can confirm / reject payments and record cash; the result matches the ledger", async () => {
    const w = await makeWorld();
    const { fee, pending } = await seedFinance(w);
    const t = await tokenFor(w.a.TREASURER.id);
    expect((await decidePayment(req(t, { decision: "reject" }), ctx({ orgId: w.orgA.id, paymentId: pending.id }))).status).toBe(409); // reason required
    expect((await decidePayment(req(t, { decision: "approve" }), ctx({ orgId: w.orgA.id, paymentId: pending.id }))).status).toBe(200);
    expect((await decidePayment(req(t, { decision: "approve" }), ctx({ orgId: w.orgA.id, paymentId: pending.id }))).status).toBe(409); // already reviewed
    expect((await recordCash(req(t, { amount: "500" }), ctx({ orgId: w.orgA.id, studentFeeId: fee.id }))).status).toBe(409); // more than owed
    expect((await recordCash(req(t, { amount: "abc" }), ctx({ orgId: w.orgA.id, studentFeeId: fee.id }))).status).toBe(400);
    const ok = await recordCash(req(t, { amount: "30" }), ctx({ orgId: w.orgA.id, studentFeeId: fee.id }));
    expect(ok.status).toBe(200);
    expect((await data(ok)).receiptCode).toMatch(/^TPK-/);
    const fin = (await data(await overviewGet(req(t), O(w.orgA.id)))).finance;
    expect(fin).toMatchObject({ collected: "90.00", outstanding: "0.00", pendingVerification: "0.00" });
    // the member sees the same facts in their personal ledger
    const mine = await data(await memberFees(req(await tokenFor(w.a.MEMBER.id)), ctx({})));
    expect(mine.fees[0]).toMatchObject({ paid: "90.00", balance: "0.00" });
  });

  it("organization routes never cross organizations: IDs from another org are not found, and non-members are refused", async () => {
    const w = await makeWorld();
    const { fee, pending } = await seedFinance(w);
    const presB = await tokenFor(w.presidentB.id);
    // not a member of Org A at all
    for (const call of [() => overviewGet(req(presB), O(w.orgA.id)), () => financeGet(req(presB), O(w.orgA.id)), () => membersGet(req(presB), O(w.orgA.id)), () => annList(req(presB), O(w.orgA.id)), () => eventsList(req(presB), O(w.orgA.id))]) {
      expect((await call()).status).toBe(403);
    }
    // a president of B naming their own org but another org's payment / fee gets "not found", and nothing changes
    expect((await decidePayment(req(presB, { decision: "approve" }), ctx({ orgId: w.orgB.id, paymentId: pending.id }))).status).toBe(404);
    expect((await recordCash(req(presB, { amount: "10" }), ctx({ orgId: w.orgB.id, studentFeeId: fee.id }))).status).toBe(404);
    expect((await db.payment.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("PENDING");
    expect((await overviewGet(req(await tokenFor(w.a.PRESIDENT.id)), O("not-a-uuid"))).status).toBe(404);
  });

  it("someone who is President in one organization and a plain member in another gets each organization's own permissions", async () => {
    const w = await makeWorld();
    await seedFinance(w);
    const both = await makeUser({ name: "Both" });
    await addMembership(both.id, w.orgA.id, "TREASURER");
    await addMembership(both.id, w.orgB.id, "MEMBER");
    const t = await tokenFor(both.id);
    const a = await data(await overviewGet(req(t), O(w.orgA.id)));
    const b = await data(await overviewGet(req(t), O(w.orgB.id)));
    expect(a.capabilities["fees.manage"]).toBe(true);
    expect(a.finance).not.toBeNull();
    expect(a.roles).toEqual([{ role: "TREASURER", title: null }]);
    expect(b.capabilities["fees.manage"]).toBe(false);
    expect(b.finance).toBeNull();
    expect(b.roles).toEqual([{ role: "MEMBER", title: null }]);
    expect((await financeGet(req(t), O(w.orgB.id))).status).toBe(403);
    expect((await annPost(req(t, { title: "Hello", body: "x", publish: true }), O(w.orgB.id))).status).toBe(403);
    expect((await annPost(req(t, { title: "Hello", body: "x", publish: true }), O(w.orgA.id))).status).toBe(403);
    // personal member features stay available whatever the organization
    expect((await me(req(t), ctx({}))).status).toBe(200);
    const profile = await data(await me(req(t), ctx({})));
    expect(profile.memberships.map((m: { role: string }) => m.role).sort()).toEqual(["MEMBER", "TREASURER"]);
  });

  it("officers keep every member feature: personal fees stay separate from organization finance", async () => {
    const w = await makeWorld();
    const ft = await db.feeType.create({ data: { organizationId: w.orgA.id, name: "Dues", amount: 100 } });
    await db.studentFee.create({ data: { organizationId: w.orgA.id, userId: w.a.TREASURER.id, feeTypeId: ft.id, title: "Treasurer dues", amountDue: 100 } });
    await db.studentFee.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, feeTypeId: ft.id, title: "Member dues", amountDue: 100 } });
    const t = await tokenFor(w.a.TREASURER.id);
    const mine = await data(await memberFees(req(t), ctx({})));
    expect(mine.fees.map((f: { title: string }) => f.title)).toEqual(["Treasurer dues"]); // only their own, not the organization ledger
    const org = await data(await financeGet(req(t), O(w.orgA.id)));
    expect(org.totals.assessed).toBe("200.00"); // organization-wide
    for (const role of ["PRESIDENT", "TREASURER", "SECRETARY", "AUDITOR", "OFFICER", "ADVISER"] as const) {
      const tk = await tokenFor(w.a[role].id);
      for (const route of [memberEvents, memberAnnouncements, memberNotifications, memberFees, me]) expect((await route(req(tk), ctx({}))).status, `${role} member route`).toBe(200);
    }
  });

  it("secretary and president can post announcements; members cannot, and members receive them", async () => {
    const w = await makeWorld();
    const member = await tokenFor(w.a.MEMBER.id);
    expect((await annPost(req(member, { title: "Nope", body: "x", publish: true }), O(w.orgA.id))).status).toBe(403);
    expect((await annList(req(member), O(w.orgA.id))).status).toBe(403);
    for (const role of ["TREASURER", "AUDITOR", "OFFICER"] as const) expect((await annPost(req(await tokenFor(w.a[role].id), { title: "Nope", body: "x", publish: true }), O(w.orgA.id))).status, role).toBe(403);
    const sec = await tokenFor(w.a.SECRETARY.id);
    expect((await annPost(req(sec, { title: "x", body: "y", publish: true }), O(w.orgA.id))).status).toBe(400); // title too short
    const created = await annPost(req(sec, { title: "General assembly", body: "Friday 3pm", publish: true }), O(w.orgA.id));
    expect(created.status).toBe(201);
    const draft = await data(await annPost(req(sec, { title: "Draft post", body: "later", publish: false }), O(w.orgA.id)));
    expect((await data(await memberAnnouncements(req(member), ctx({})))).announcements.map((a: { title: string }) => a.title)).toEqual(["General assembly"]);
    expect((await data(await memberNotifications(req(member), ctx({})))).notifications.map((n: { title: string }) => n.title)).toEqual(["New announcement: General assembly"]);
    expect((await data(await annList(req(sec), O(w.orgA.id)))).announcements).toHaveLength(2); // managers see drafts too
    void draft;
  });

  it("check-in chart counts only this organization's records and only for positions that may see attendance", async () => {
    const w = await makeWorld();
    const { makeEvent } = await import("./helpers/world");
    const ev = await makeEvent(w.orgA.id);
    const evB = await makeEvent(w.orgB.id);
    await db.attendanceRecord.create({ data: { eventId: ev.id, sessionId: ev.session.id, userId: w.a.MEMBER.id, status: "PRESENT", source: "QR_SELF" } });
    await db.attendanceRecord.create({ data: { eventId: ev.id, sessionId: ev.session.id, userId: w.a.TREASURER.id, status: "LATE", source: "QR_SELF" } });
    await db.attendanceRecord.create({ data: { eventId: evB.id, sessionId: evB.session.id, userId: w.memberB.id, status: "PRESENT", source: "QR_SELF" } });
    const pres = await data(await overviewGet(req(await tokenFor(w.a.PRESIDENT.id)), O(w.orgA.id)));
    expect(pres.attendance.byMonth).toHaveLength(6);
    expect(pres.attendance.byMonth[5].value).toBe(2);
    expect(pres.attendance.checkins30Days).toBe(2);
    const treas = await data(await overviewGet(req(await tokenFor(w.a.TREASURER.id)), O(w.orgA.id)));
    expect(treas.attendance).toBeNull();
  });

  it("officers and secretary can create, publish and open events; members and treasurer cannot, and drafts stay hidden from members", async () => {
    const w = await makeWorld();
    const when = { startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: new Date(Date.now() + 90_000_000).toISOString() };
    const input = { title: "Foundation Day", venue: "Gym", ...when };
    for (const role of ["MEMBER", "TREASURER", "AUDITOR", "ADVISER"] as const) expect((await eventPost(req(await tokenFor(w.a[role].id), input), O(w.orgA.id))).status, role).toBe(403);
    const officer = await tokenFor(w.a.OFFICER.id);
    expect((await eventPost(req(officer, { ...input, endsAt: when.startsAt }), O(w.orgA.id))).status).toBe(400); // ends before it starts
    const created = await data(await eventPost(req(officer, input), O(w.orgA.id)));
    const member = await tokenFor(w.a.MEMBER.id);
    expect((await data(await memberEvents(req(member), ctx({})))).events).toHaveLength(0); // draft is private
    const list = await data(await eventsList(req(officer), O(w.orgA.id)));
    expect(list.events[0]).toMatchObject({ title: "Foundation Day", status: "DRAFT", sessions: [{ active: false }] });
    const sessionId = list.events[0].sessions[0].id;
    // cannot open check-in before publishing
    expect((await sessionToggle(req(officer, { active: true }), ctx({ orgId: w.orgA.id, id: created.id, sessionId }))).status).toBe(409);
    expect((await eventStatus(req(member, { status: "PUBLISHED" }), ctx({ orgId: w.orgA.id, id: created.id }))).status).toBe(403);
    expect((await eventStatus(req(officer, { status: "PUBLISHED" }), ctx({ orgId: w.orgA.id, id: created.id }))).status).toBe(200);
    expect((await sessionToggle(req(officer, { active: true }), ctx({ orgId: w.orgA.id, id: created.id, sessionId }))).status).toBe(200);
    expect((await data(await memberEvents(req(member), ctx({})))).events.map((e: { title: string }) => e.title)).toEqual(["Foundation Day"]);
    // a session id from a different event/organization is not found
    const other = await tokenFor(w.presidentB.id);
    expect((await sessionToggle(req(other, { active: false }), ctx({ orgId: w.orgB.id, id: created.id, sessionId }))).status).toBe(404);
  });

  it("member list and documents follow the policy (roster emails only for president/secretary/adviser)", async () => {
    const w = await makeWorld();
    expect((await membersGet(req(await tokenFor(w.a.MEMBER.id)), O(w.orgA.id))).status).toBe(403);
    const aud = await data(await membersGet(req(await tokenFor(w.a.AUDITOR.id)), O(w.orgA.id)));
    expect(aud.members.length).toBe(7);
    expect(aud.members[0].email).toBeUndefined();
    expect((await data(await membersGet(req(await tokenFor(w.a.PRESIDENT.id)), O(w.orgA.id)))).members[0].email).toContain("@");
    await db.document.create({ data: { organizationId: w.orgA.id, title: "Minutes", fileName: "m.pdf", mimeType: "application/pdf", sizeBytes: 10, storageKey: "00000000-0000-0000-0000-000000000001" } });
    const asMember = await data(await docsGet(req(await tokenFor(w.a.MEMBER.id)), O(w.orgA.id)));
    expect(asMember).toMatchObject({ canManage: false, documents: [{ title: "Minutes" }] });
    expect((await data(await docsGet(req(await tokenFor(w.a.SECRETARY.id)), O(w.orgA.id)))).canManage).toBe(true);
  });

  it("member detail: attendance rate and fees counted for this organization only, each block gated by its capability", async () => {
    const w = await makeWorld();
    const { makeEvent } = await import("./helpers/world");
    const ev = await makeEvent(w.orgA.id, { sessions: 4 });
    const m = w.a.MEMBER.id;
    const rec = (i: number, status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED") => db.attendanceRecord.create({ data: { eventId: ev.id, sessionId: ev.sessions[i].id, userId: m, status, source: "QR_SELF" } });
    await rec(0, "PRESENT"); await rec(1, "LATE"); await rec(2, "ABSENT"); await rec(3, "EXCUSED");
    // the same member's records in another organization never count here
    await addMembership(m, w.orgB.id, "MEMBER");
    const evB = await makeEvent(w.orgB.id);
    await db.attendanceRecord.create({ data: { eventId: evB.id, sessionId: evB.session.id, userId: m, status: "ABSENT", source: "QR_SELF" } });
    const ft = await db.feeType.create({ data: { organizationId: w.orgA.id, name: "Dues", amount: 100 } });
    const fee = await db.studentFee.create({ data: { organizationId: w.orgA.id, userId: m, feeTypeId: ft.id, title: "Dues", amountDue: 100 } });
    await db.payment.create({ data: { studentFeeId: fee.id, amount: 30, method: "CASH", status: "CONFIRMED", receiptCode: "TPK-M-1" } });
    const C = ctx({ orgId: w.orgA.id, userId: m });

    const pres = await data(await memberGet(req(await tokenFor(w.a.PRESIDENT.id)), C));
    expect(pres.attendance.counts).toEqual({ PRESENT: 1, LATE: 1, ABSENT: 1, EXCUSED: 1 });
    expect(pres.attendance.rate).toBe(67); // 2 attended of 3 counted; excused is not held against them
    expect(pres.attendance.recent).toHaveLength(4);
    expect(pres.finance).toMatchObject({ due: "100.00", paid: "30.00", balance: "70.00" });
    expect(pres.email).toContain("@");

    const treas = await data(await memberGet(req(await tokenFor(w.a.TREASURER.id)), C));
    expect(treas.attendance).toBeNull(); // treasurer cannot see attendance
    expect(treas.finance.balance).toBe("70.00");
    expect(treas.email).toBeUndefined();
    const officer = await data(await memberGet(req(await tokenFor(w.a.OFFICER.id)), C));
    expect(officer.attendance.rate).toBe(67);
    expect(officer.finance).toBeNull(); // officer cannot see fees

    // members cannot open anyone's record; another org's officer cannot either; non-members of the org are not found
    expect((await memberGet(req(await tokenFor(w.a.MEMBER.id)), C)).status).toBe(403);
    expect((await memberGet(req(await tokenFor(w.presidentB.id)), C)).status).toBe(403);
    expect((await memberGet(req(await tokenFor(w.presidentB.id)), ctx({ orgId: w.orgB.id, userId: w.a.TREASURER.id }))).status).toBe(404);
    // via Org B the same member shows only Org B data
    const viaB = await data(await memberGet(req(await tokenFor(w.presidentB.id)), ctx({ orgId: w.orgB.id, userId: m })));
    expect(viaB.attendance.counts).toEqual({ PRESENT: 0, LATE: 0, ABSENT: 1, EXCUSED: 0 });
    expect(viaB.finance.fees).toHaveLength(0);
  });

  it("expenses on mobile: Treasurer records, President approves, balance updates once; Auditor/Adviser read-only; other orgs refused", async () => {
    const w = await makeWorld();
    await seedFinance(w); // ₱40 confirmed collected in Org A
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    const rec = (t: string, over: Record<string, unknown> = {}) => expensePost(req(t, { type: "EXPENSE", title: "Printing", amount: "25", category: "PRINTING", occurredOn: today, purpose: "Flyers", requestId: crypto.randomUUID(), ...over }), O(w.orgA.id));
    const treasurer = await tokenFor(w.a.TREASURER.id);
    const president = await tokenFor(w.a.PRESIDENT.id);
    for (const role of ["PRESIDENT", "AUDITOR", "ADVISER", "SECRETARY", "MEMBER"] as const) expect((await rec(await tokenFor(w.a[role].id))).status, role).toBe(403);
    const created = await rec(treasurer);
    expect(created.status).toBe(201);
    const { id } = await data(created);
    const list = await data(await expensesGet(req(treasurer), O(w.orgA.id)));
    expect(list).toMatchObject({ canRecord: true, canApprove: false, summary: { available: "40.00", pendingExpenseCount: 1 } });
    // the treasurer cannot approve; auditor/adviser cannot decide or cancel
    expect((await expenseDecide(req(treasurer, { action: "approve" }), ctx({ orgId: w.orgA.id, id }))).status).toBe(403);
    for (const role of ["AUDITOR", "ADVISER"] as const) {
      const t = await tokenFor(w.a[role].id);
      expect((await data(await expensesGet(req(t), O(w.orgA.id)))).canApprove).toBe(false);
      for (const action of ["approve", "reject", "cancel", "reverse"]) expect((await expenseDecide(req(t, { action, reason: "x x x" }), ctx({ orgId: w.orgA.id, id }))).status, `${role} ${action}`).toBe(403);
    }
    // a president of another org naming their org with this record id gets 404
    expect((await expenseDecide(req(await tokenFor(w.presidentB.id), { action: "approve" }), ctx({ orgId: w.orgB.id, id }))).status).toBe(404);
    const ok = await expenseDecide(req(president, { action: "approve" }), ctx({ orgId: w.orgA.id, id }));
    expect(await data(ok)).toMatchObject({ ok: true, available: "15.00" });
    expect((await expenseDecide(req(president, { action: "approve" }), ctx({ orgId: w.orgA.id, id }))).status).toBe(409);
    const ov = await data(await overviewGet(req(president), O(w.orgA.id)));
    expect(ov.finance).toMatchObject({ collected: "40.00", expenses: "25.00", available: "15.00" });
    // too large to approve
    const big = await data(await rec(treasurer, { amount: "100" }));
    expect(await data(await expenseDecide(req(president, { action: "approve" }), ctx({ orgId: w.orgA.id, id: big.id })))).toMatchObject({ error: { message: expect.stringMatching(/Not enough funds/) } });
  });

  it("rejects missing/invalid tokens and system administrators on every organization route", async () => {
    const w = await makeWorld();
    const admin = "a".repeat(43);
    await db.session.create({ data: { userId: w.admin.id, tokenHash: hashToken(admin), expiresAt: new Date(Date.now() + 3_600_000) } });
    const routes = [overviewGet, financeGet, annList, eventsList, membersGet, docsGet];
    for (const r of routes) {
      expect((await r(req(null), O(w.orgA.id))).status).toBe(401);
      expect((await r(req("x".repeat(43)), O(w.orgA.id))).status).toBe(401);
      expect((await r(req(admin), O(w.orgA.id))).status).toBe(403);
      expect((await data(await r(req(admin), O(w.orgA.id)))).error.code).toBe("ADMIN_WEB_ONLY");
    }
  });
});
