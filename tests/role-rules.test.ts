import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/mobile/login/route";
import { GET as joinGet, POST as joinPost } from "@/app/api/mobile/join/route";
import { POST as joinCancel } from "@/app/api/mobile/join/[id]/route";
import { GET as overviewGet } from "@/app/api/mobile/org/[orgId]/overview/route";
import { GET as financeGet } from "@/app/api/mobile/org/[orgId]/finance/route";
import { GET as membersGet } from "@/app/api/mobile/org/[orgId]/members/route";
import { GET as expensesGet, POST as expensePost } from "@/app/api/mobile/org/[orgId]/expenses/route";
import { POST as expenseDecide } from "@/app/api/mobile/org/[orgId]/expenses/[id]/route";
import { POST as eventPost } from "@/app/api/mobile/org/[orgId]/events/route";
import { POST as eventStatus } from "@/app/api/mobile/org/[orgId]/events/[id]/status/route";
import { POST as sessionToggle } from "@/app/api/mobile/org/[orgId]/events/[id]/sessions/[sessionId]/route";
import { POST as annPost } from "@/app/api/mobile/org/[orgId]/announcements/route";
import { POST as paymentDecide } from "@/app/api/mobile/org/[orgId]/payments/[paymentId]/route";
import { POST as cashPost } from "@/app/api/mobile/org/[orgId]/fees/[studentFeeId]/payments/route";
import { POST as mobileScan } from "@/app/api/mobile/scan/route";
import { ADVISER_WRITE_EXCEPTIONS, ORG_POLICY, READ_ONLY_CAPABILITIES, canOrg, type OrgPermission } from "@/lib/permissions/policy";
import { navItemsFor } from "@/config/navigation";
import { adjustAttendanceAction, finalizeSessionAction, getSessionQrAction, manualEntryAction, revokeSessionQrAction, scanAttendanceAction, selfCheckInAction, setSessionActiveAction, toggleSessionAction } from "@/features/attendance/actions";
import { registerDeviceAction, revokeDeviceAction } from "@/features/attendance/device-actions";
import { createEventAction, deleteEventAction, setEventStatusAction, updateEventAction } from "@/features/events/actions";
import { createAnnouncementAction, deleteAnnouncementAction } from "@/features/announcements/actions";
import { adjustLedgerAction, assessMemberAction, assignFeeAction, createFeeTypeAction, recordPaymentAction, verifyPaymentAction, voidPaymentAction } from "@/features/fees/actions";
import { decideFundAction, recordFundAction, reverseFundAction } from "@/features/finance/actions";
import { createEvaluationAction } from "@/features/evaluations/actions";
import { cancelObligationAction, completeObligationAction, createObligationAction } from "@/features/obligations/actions";
import { createRuleAction, updateConsequenceStatusAction } from "@/features/consequences/actions";
import { removeDocumentAction } from "@/features/documents/actions";
import { endMembershipAction, changeMemberRoleAction, addMemberAction } from "@/features/organizations/actions";
import { generateJoinCodeAction } from "@/features/organizations/join-actions";
import { makeMemberQr, makeSessionQr } from "@/features/attendance/qr";
import { registerDevice } from "@/features/attendance/devices";
import { ForbiddenError } from "@/lib/permissions";
import { addMembership, db, form, makeUser, signInAs } from "./helpers/db";
import { auth, makeEvent, makeWorld, ROLES } from "./helpers/world";

const req = (token: string, body?: unknown) =>
  new Request("http://localhost/api/mobile/x", {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
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

/** Resolves when the call was refused: a permission error, or a result that reports failure. Anything else fails the test. */
async function refused(label: string, call: () => Promise<unknown>) {
  try {
    const r = (await call()) as Record<string, unknown> | undefined | null;
    if (r instanceof Response) { expect(r.status, label).toBeGreaterThanOrEqual(400); return; }
    if (r && typeof r === "object") expect(r.ok === false || !!r.error || r.ok === undefined && !("success" in r) && !("key" in r), `${label}: ${JSON.stringify(r)}`).toBe(true);
  } catch (e) {
    expect(e, label).toBeInstanceOf(ForbiddenError);
  }
}

describe("joining from the app: immediate, Member only, no duplicates", () => {
  it("a student joins, the organization's member list and count update, and joining again is refused", async () => {
    const w = await makeWorld();
    const student = await makeUser({ name: "Student" });
    const t = await tokenFor(student.id);
    const before = await data(await joinGet(req(t), ctx({})));
    const orgA = before.organizations.find((o: { id: string }) => o.id === w.orgA.id);
    expect(orgA).toMatchObject({ name: "Org A", members: 7 });

    const res = await joinPost(req(t, { organizationId: w.orgA.id }), ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, joined: true, organization: "Org A" });
    expect(await db.organizationMember.findFirstOrThrow({ where: { userId: student.id, organizationId: w.orgA.id, endedAt: null } })).toMatchObject({ role: "MEMBER" });
    expect(await db.organizationMember.count({ where: { organizationId: w.orgA.id, endedAt: null } })).toBe(8);
    const sec = await tokenFor(w.a.SECRETARY.id);
    expect((await data(await membersGet(req(sec), ctx({ orgId: w.orgA.id })))).members.map((m: { userId: string }) => m.userId)).toContain(student.id);

    expect((await joinPost(req(t, { organizationId: w.orgA.id }), ctx({}))).status).toBe(409);
    const after = await data(await joinGet(req(t), ctx({})));
    expect(after.organizations.map((o: { id: string }) => o.id)).not.toContain(w.orgA.id);
    // the joined student holds only the Member position: no officer capability anywhere
    const u = await auth(student.id);
    for (const p of Object.keys(ORG_POLICY) as OrgPermission[]) expect(canOrg(u, p, w.orgA.id), p).toBe((ORG_POLICY[p] as readonly string[]).includes("MEMBER"));
  });

  it("refuses bad input, unauthenticated calls, and organizations that cannot be joined", async () => {
    const w = await makeWorld();
    const student = await makeUser({ name: "Student" });
    const t = await tokenFor(student.id);
    expect((await joinPost(req(t, { organizationId: "nope" }), ctx({}))).status).toBe(400);
    expect((await joinPost(new Request("http://localhost/api/mobile/join", { method: "POST", body: JSON.stringify({ organizationId: w.orgA.id }) }), ctx({}))).status).toBe(401);
    const dept = await db.organization.create({ data: { name: "Dept", scope: "UNIVERSITY_WIDE" } });
    expect((await joinPost(req(t, { organizationId: dept.id }), ctx({}))).status).toBe(409);
    expect(await db.organizationMember.count({ where: { userId: student.id } })).toBe(0);
  });

  it("old pending requests show as history and can be withdrawn only by their owner", async () => {
    const w = await makeWorld();
    const student = await makeUser({ name: "Student" });
    const r = await db.joinRequest.create({ data: { organizationId: w.orgA.id, userId: student.id } });
    const t = await tokenFor(student.id);
    expect((await data(await joinGet(req(t), ctx({})))).requests).toEqual([expect.objectContaining({ organization: "Org A", status: "PENDING" })]);
    expect((await joinCancel(req(await tokenFor(w.a.MEMBER.id), {}), ctx({ id: r.id }))).status).toBe(404);
    expect((await joinCancel(req(t, {}), ctx({ id: r.id }))).status).toBe(200);
    expect((await db.joinRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("CANCELLED");
  });
});

describe("the Adviser is strictly read-only", () => {
  it("holds no capability that changes data except the approved one (designating officers)", () => {
    const adviserCaps = (Object.keys(ORG_POLICY) as OrgPermission[]).filter((p) => (ORG_POLICY[p] as readonly string[]).includes("ADVISER"));
    for (const p of adviserCaps) expect([...READ_ONLY_CAPABILITIES, ...ADVISER_WRITE_EXCEPTIONS] as readonly string[], p).toContain(p);
    expect(ADVISER_WRITE_EXCEPTIONS).toEqual(["officers.designate"]);
    for (const p of ["attendance.scan", "attendance.manual", "attendance.excuse", "devices.manage", "members.manage", "events.manage", "fees.manage", "expenses.record", "expenses.approve", "consequences.manage", "consequences.waive"] as const) {
      expect(ORG_POLICY[p] as readonly string[], p).not.toContain("ADVISER");
    }
  });

  it("every write action and endpoint refuses the Adviser, and nothing is changed or logged in their name", async () => {
    const w = await makeWorld();
    const adviser = w.a.ADVISER.id;
    const ev = await makeEvent(w.orgA.id);
    const reg = await registerDevice(w.a.PRESIDENT.id, w.orgA.id, "Gate");
    if (!reg.ok) throw new Error("device");
    const device = await db.scannerDevice.findFirstOrThrow();
    const ft = await db.feeType.create({ data: { organizationId: w.orgA.id, name: "Dues", amount: 100 } });
    const fee = await db.studentFee.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, feeTypeId: ft.id, title: "Dues", amountDue: 100 } });
    const pay = await db.payment.create({ data: { studentFeeId: fee.id, amount: 40, method: "GCASH", status: "PENDING", receiptCode: "TPK-R-1", reference: "X" } });
    const fund = await db.fundTransaction.create({ data: { organizationId: w.orgA.id, type: "EXPENSE", title: "Tarp", amount: 10, category: "PRINTING", occurredOn: new Date(), purpose: "x", recordedById: w.a.TREASURER.id, requestId: "r-1" } });
    const rec = await db.attendanceRecord.create({ data: { eventId: ev.id, sessionId: ev.session.id, userId: w.a.MEMBER.id, status: "ABSENT", source: "SYSTEM" } });
    const ob = await db.obligation.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, title: "Clean up" } }).catch(() => null);
    const before = await Promise.all([db.event.count(), db.announcement.count(), db.attendanceRecord.count(), db.scannerDevice.count({ where: { active: true } }), db.fundTransaction.count({ where: { status: "PENDING" } }), db.payment.count({ where: { status: "PENDING" } }), db.joinRequest.count({ where: { status: "PENDING" } }), db.organizationMember.count(), db.feeType.count(), db.studentFee.count(), db.consequenceRule.count(), db.evaluationForm.count(), db.organizationJoinCode.count()]);

    await signInAs(adviser);
    const O = w.orgA.id, S = ev.session.id;
    const web: [string, () => Promise<unknown>][] = [
      ["scan member QR", () => scanAttendanceAction(S, makeMemberQr(w.a.MEMBER.id))],
      ["self check-in", () => selfCheckInAction(makeSessionQr(S), S)],
      ["session QR", () => getSessionQrAction(S)],
      ["revoke QR", () => revokeSessionQrAction(form({ sessionId: S }))],
      ["activate session", () => setSessionActiveAction(form({ sessionId: S, active: "false" }))],
      ["toggle session", () => toggleSessionAction(S, false)],
      ["finalize session", () => finalizeSessionAction(form({ sessionId: S }))],
      ["manual attendance", () => manualEntryAction({}, form({ sessionId: S, userId: w.a.OFFICER.id, status: "PRESENT", remark: "Was there" }))],
      ["excuse absence", () => adjustAttendanceAction({}, form({ recordId: rec.id, status: "EXCUSED", remark: "Medical certificate" }))],
      ["register device", () => registerDeviceAction({}, form({ organizationId: O, name: "Mine" }))],
      ["revoke device", () => revokeDeviceAction(form({ deviceId: device.id }))],
      ["create event", () => createEventAction({}, form({ organizationId: O, title: "New", venue: "Gym", startsAt: "2030-01-01T08:00", endsAt: "2030-01-01T10:00" }))],
      ["edit event", () => updateEventAction({}, form({ eventId: ev.id, title: "Changed" }))],
      ["event status", () => setEventStatusAction(form({ eventId: ev.id, status: "CANCELLED" }))],
      ["delete event", () => deleteEventAction(form({ eventId: ev.id }))],
      ["announcement", () => createAnnouncementAction({}, form({ organizationId: O, title: "Hi", body: "Body text", publish: "on" }))],
      ["delete announcement", () => deleteAnnouncementAction(form({ id: "00000000-0000-4000-8000-000000000000" }))],
      ["fee type", () => createFeeTypeAction({}, form({ organizationId: O, name: "Shirt", amount: "250", kind: "DUES" }))],
      ["assess fee", () => assignFeeAction(form({ feeTypeId: ft.id }))],
      ["record cash", () => recordPaymentAction({}, form({ studentFeeId: fee.id, amount: "10", method: "CASH" }))],
      ["verify payment", () => verifyPaymentAction(form({ paymentId: pay.id, decision: "approve" }))],
      ["void payment", () => voidPaymentAction(form({ paymentId: pay.id, reason: "test test" }))],
      ["ledger adjustment", () => adjustLedgerAction({}, form({ studentFeeId: fee.id, type: "WAIVER", amount: "10", reason: "because" }))],
      ["record expense", () => recordFundAction({}, form({ organizationId: O, type: "EXPENSE", title: "X", amount: "5", category: "SUPPLIES", occurredOn: "2026-10-01", purpose: "x", requestId: "r-2" }))],
      ["approve expense", () => decideFundAction({}, form({ id: fund.id, decision: "approve" }))],
      ["reverse expense", () => reverseFundAction({}, form({ id: fund.id, reason: "x" }))],
      ["add member", () => addMemberAction({}, form({ organizationId: O, email: "x@y.z", role: "MEMBER", title: "" }))],
      ["end membership", () => endMembershipAction(form({ organizationId: O, membershipId: "00000000-0000-4000-8000-000000000000" }))],
      ["change position", () => changeMemberRoleAction(form({ organizationId: O, membershipId: "00000000-0000-4000-8000-000000000000", role: "OFFICER" }))],
      ["join code", () => generateJoinCodeAction({}, form({ organizationId: O }))],
      ["evaluation", () => createEvaluationAction(form({ eventId: ev.id }))],
      ["obligation", () => createObligationAction({}, form({ organizationId: O, title: "Task", userIds: w.a.MEMBER.id }))],
      ...(ob ? [["complete obligation", () => completeObligationAction(form({ obligationId: ob.id }))], ["cancel obligation", () => cancelObligationAction(form({ obligationId: ob.id }))]] as [string, () => Promise<unknown>][] : []),
      ["consequence rule", () => createRuleAction({}, form({ organizationId: O, name: "Late fine", fineAmount: "20" }))],
      ["waive consequence", () => updateConsequenceStatusAction(form({ consequenceId: "00000000-0000-4000-8000-000000000000", status: "WAIVED", note: "x" }))],
      ["remove document", () => removeDocumentAction(form({ documentId: "00000000-0000-4000-8000-000000000000" }))],
    ];
    for (const [label, call] of web) await refused(label, call);

    const t = await tokenFor(adviser);
    const C = (p: Record<string, string>) => ctx({ orgId: O, ...p });
    const api: [string, () => Promise<Response>][] = [
      ["api scan", () => mobileScan(req(t, { code: makeSessionQr(S), sessionId: S }), ctx({}))],
      ["api session", () => sessionToggle(req(t, { active: false }), C({ id: ev.id, sessionId: S }))],
      ["api event", () => eventPost(req(t, { title: "X", venue: "Y", startsAt: "2030-01-01T08:00:00Z", endsAt: "2030-01-01T10:00:00Z" }), C({}))],
      ["api event status", () => eventStatus(req(t, { status: "CANCELLED" }), C({ id: ev.id }))],
      ["api announcement", () => annPost(req(t, { title: "T", body: "Body", publish: true }), C({}))],
      ["api payment", () => paymentDecide(req(t, { decision: "approve" }), C({ paymentId: pay.id }))],
      ["api cash", () => cashPost(req(t, { amount: "10", method: "CASH" }), C({ studentFeeId: fee.id }))],
      ["api expense", () => expensePost(req(t, { type: "EXPENSE", title: "X", amount: "5", category: "SUPPLIES", occurredOn: "2026-10-01", purpose: "x", requestId: "r-3" }), C({}))],
      ["api expense decide", () => expenseDecide(req(t, { action: "approve" }), C({ id: fund.id }))],
    ];
    for (const [label, call] of api) {
      const res = await call();
      if (label === "api scan") expect((await data(res)).ok, label).toBe(false); // check-in answers 200 with ok:false
      else expect(res.status, label).toBe(403);
    }

    const after = await Promise.all([db.event.count(), db.announcement.count(), db.attendanceRecord.count(), db.scannerDevice.count({ where: { active: true } }), db.fundTransaction.count({ where: { status: "PENDING" } }), db.payment.count({ where: { status: "PENDING" } }), db.joinRequest.count({ where: { status: "PENDING" } }), db.organizationMember.count(), db.feeType.count(), db.studentFee.count(), db.consequenceRule.count(), db.evaluationForm.count(), db.organizationJoinCode.count()]);
    expect(after).toEqual(before);
    expect(await db.event.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ title: ev.title, status: "PUBLISHED" });
    expect(await db.eventSession.findUniqueOrThrow({ where: { id: S } })).toMatchObject({ active: true, finalizedAt: null });
    expect((await db.attendanceRecord.findUniqueOrThrow({ where: { id: rec.id } })).status).toBe("ABSENT");
    // the only thing recorded in the adviser's name is their own sign-in to the app
    expect((await db.auditLog.findMany({ where: { actorUserId: adviser }, select: { action: true } })).map((a) => a.action)).toEqual(["auth.login_mobile"]);
  });

  it("can designate officers in their own organization, and nothing beyond that", async () => {
    const w = await makeWorld();
    const role = async (userId: string, orgId = w.orgA.id) => (await db.organizationMember.findFirstOrThrow({ where: { userId, organizationId: orgId, endedAt: null } })).role;
    const mid = async (userId: string, orgId = w.orgA.id) => (await db.organizationMember.findFirstOrThrow({ where: { userId, organizationId: orgId, endedAt: null } })).id;
    const change = async (userId: string, to: string, orgId = w.orgA.id) => changeMemberRoleAction(form({ organizationId: orgId, membershipId: await mid(userId, orgId), role: to }));

    await signInAs(w.a.ADVISER.id);
    expect(await change(w.a.MEMBER.id, "OFFICER")).toEqual({});
    expect(await role(w.a.MEMBER.id)).toBe("OFFICER");
    expect(await change(w.a.SECRETARY.id, "TREASURER")).toEqual({});
    expect(await change(w.a.OFFICER.id, "MEMBER")).toEqual({});
    expect(await role(w.a.OFFICER.id)).toBe("MEMBER");
    // never the President or Adviser positions, in either direction
    expect((await change(w.a.MEMBER.id, "PRESIDENT")).error).toBeTruthy();
    expect((await change(w.a.MEMBER.id, "ADVISER")).error).toBeTruthy();
    expect((await change(w.a.PRESIDENT.id, "MEMBER")).error).toBeTruthy();
    expect(await role(w.a.PRESIDENT.id)).toBe("PRESIDENT");
    // not in another organization, and still no adding or removing members
    await expect(change(w.memberB.id, "OFFICER", w.orgB.id)).rejects.toBeInstanceOf(ForbiddenError);
    const outsider = await makeUser({ email: "outsider@example.test" });
    await expect(addMemberAction({}, form({ organizationId: w.orgA.id, email: outsider.email, role: "MEMBER", title: "" }))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.organizationMember.count({ where: { userId: outsider.id } })).toBe(0);
    await expect(endMembershipAction(form({ organizationId: w.orgA.id, membershipId: await mid(w.a.AUDITOR.id) }))).rejects.toBeInstanceOf(ForbiddenError);
    // history and audit: the old position is ended, a new one started, and the change is recorded in the adviser's name
    expect(await db.organizationMember.count({ where: { userId: w.a.MEMBER.id, organizationId: w.orgA.id } })).toBe(2);
    expect(await db.auditLog.count({ where: { actorUserId: w.a.ADVISER.id, action: "membership.role_change" } })).toBe(3);

    // other positions still cannot change positions; the President still can
    for (const r of ["SECRETARY", "TREASURER", "AUDITOR", "OFFICER"] as const) {
      await signInAs(w.a[r].id);
      await expect(change(w.a.AUDITOR.id, "OFFICER"), r).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.a.PRESIDENT.id);
    expect(await change(w.a.AUDITOR.id, "OFFICER")).toEqual({});
  });

  it("is never assessed member fees, in bulk or individually by student number", async () => {
    const w = await makeWorld();
    await db.studentProfile.create({ data: { userId: w.a.ADVISER.id, studentNumber: "FAC-0001" } });
    const ft = await db.feeType.create({ data: { organizationId: w.orgA.id, name: "Dues", amount: 100 } });
    await signInAs(w.a.TREASURER.id);
    await assignFeeAction(form({ feeTypeId: ft.id }));
    expect(await assessMemberAction({}, form({ feeTypeId: ft.id, studentNumber: "FAC-0001" }))).toMatchObject({ error: expect.stringMatching(/Advisers are not assessed/) });
    expect(await db.studentFee.count({ where: { userId: w.a.ADVISER.id } })).toBe(0);
    expect(await db.studentFee.count({ where: { feeTypeId: ft.id } })).toBe(6);
  });

  it("can still view organization information, records and finances (read-only)", async () => {
    const w = await makeWorld();
    const t = await tokenFor(w.a.ADVISER.id);
    const C = ctx({ orgId: w.orgA.id });
    const ov = await data(await overviewGet(req(t), C));
    expect(ov.capabilities).toMatchObject({ "members.basic": true, "members.roster": true, "attendance.view_org": true, "fees.view_org": true, "reports.finance": true, "evaluations.results": true, "obligations.view_org": true });
    expect(ov.capabilities).toMatchObject({ "events.manage": false, "fees.manage": false, "expenses.record": false, "expenses.approve": false, "announcements.manage": false, "documents.manage": false });
    expect((await financeGet(req(t), C)).status).toBe(200);
    expect((await membersGet(req(t), C)).status).toBe(200);
    const ex = await data(await expensesGet(req(t), C));
    expect(ex).toMatchObject({ canRecord: false, canApprove: false });
    const u = await auth(w.a.ADVISER.id);
    for (const p of READ_ONLY_CAPABILITIES) expect(canOrg(u, p, w.orgA.id), p).toBe((ORG_POLICY[p] as readonly string[]).includes("ADVISER"));
    const links = navItemsFor(u).map((i) => i.href);
    expect(links).toEqual(expect.arrayContaining(["/attendance/records", "/fees/manage", "/organizations/manage", "/consequences/manage"]));
    expect(links).not.toContain("/attendance/scan"); // an Adviser-only account has no check-in link
  });
});

describe("an Adviser-only account has no personal member features", () => {
  it("sidebar: no check-in, own attendance, obligations, consequences, fees or My Organizations; others keep them", async () => {
    const w = await makeWorld();
    const personal = ["/attendance/scan", "/attendance", "/obligations", "/consequences", "/fees", "/organizations"];
    const links = async (id: string) => navItemsFor(await auth(id)).map((i) => i.href);
    const adviser = await links(w.a.ADVISER.id);
    for (const h of personal) expect(adviser, h).not.toContain(h);
    expect(adviser).toEqual(expect.arrayContaining(["/dashboard", "/events", "/attendance/records", "/fees/manage", "/organizations/manage", "/settings", "/announcements"]));
    for (const id of [w.a.MEMBER.id, w.a.OFFICER.id, w.a.TREASURER.id]) expect(await links(id)).toEqual(expect.arrayContaining(personal));
    expect(await links(w.nobody.id)).toContain("/organizations"); // no organization yet: can still join one
    await addMembership(w.a.ADVISER.id, w.orgB.id, "MEMBER"); // adviser in A, member in B: a member again
    expect(await links(w.a.ADVISER.id)).toEqual(expect.arrayContaining(personal));
  });

  it("dashboard renders without the personal sections", async () => {
    const w = await makeWorld();
    const { default: Dashboard } = await import("@/app/(dashboard)/dashboard/page");
    await signInAs(w.a.ADVISER.id);
    // every text and label in the rendered element tree
    const texts = (node: unknown, out: string[] = [], seen = new WeakSet<object>()): string[] => {
      if (typeof node === "string" || typeof node === "number") out.push(String(node));
      else if (Array.isArray(node)) node.forEach((n) => texts(n, out, seen));
      else if (node && typeof node === "object" && !seen.has(node)) {
        seen.add(node);
        const props = (node as { props?: Record<string, unknown> }).props;
        if (props) for (const k of ["children", "title", "label", "subtitle", "actions"]) texts(props[k], out, seen);
      }
      return out;
    };
    const adviserText = texts(await Dashboard()).join(" | ");
    expect(adviserText).not.toMatch(/Balance due|Events attended|My attendance|My open obligations|Scan attendance QR/);
    expect(adviserText).toMatch(/read-only oversight/);
    await signInAs(w.a.MEMBER.id);
    expect(texts(await Dashboard()).join(" | ")).toMatch(/Balance due/);
  });
});

describe("the rest of the role matrix is unchanged", () => {
  it("keeps device management with the President and Secretary, scanning with the officers, and finance roles apart", async () => {
    const w = await makeWorld();
    const who = async (p: OrgPermission) => {
      const out: string[] = [];
      for (const r of ROLES) if (canOrg(await auth(w.a[r].id), p, w.orgA.id)) out.push(r);
      return out;
    };
    expect(await who("devices.manage")).toEqual(["PRESIDENT", "SECRETARY"]);
    expect(await who("attendance.scan")).toEqual(["PRESIDENT", "SECRETARY", "OFFICER"]);
    expect(await who("fees.manage")).toEqual(["PRESIDENT", "TREASURER"]);
    expect(await who("expenses.record")).toEqual(["TREASURER"]);
    expect(await who("expenses.approve")).toEqual(["PRESIDENT"]);
    expect(await who("fees.view_org")).toEqual(["PRESIDENT", "TREASURER", "AUDITOR", "ADVISER"]);
    expect(await who("events.manage")).toEqual(["PRESIDENT", "SECRETARY", "OFFICER"]);
    // members keep their personal features: the check-in link and the app's scan both work for them
    expect(navItemsFor(await auth(w.a.MEMBER.id)).map((i) => i.href)).toContain("/attendance/scan");
  });

  it("uses the position held in the selected organization: Secretary in one, plain member in another", async () => {
    const w = await makeWorld();
    await addMembership(w.a.SECRETARY.id, w.orgB.id, "MEMBER");
    const t = await tokenFor(w.a.SECRETARY.id);
    const post = (orgId: string) => annPost(req(t, { title: "Meeting", body: "Room 101", publish: false }), ctx({ orgId }));
    expect((await post(w.orgA.id)).status).toBe(201);
    expect((await post(w.orgB.id)).status).toBe(403);
    // an Adviser in A who is an Officer in B can scan in B only
    await addMembership(w.a.ADVISER.id, w.orgB.id, "OFFICER");
    const u = await auth(w.a.ADVISER.id);
    expect(canOrg(u, "attendance.scan", w.orgA.id)).toBe(false);
    expect(canOrg(u, "attendance.scan", w.orgB.id)).toBe(true);
  });
});
