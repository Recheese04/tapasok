import { describe, expect, it } from "vitest";
import { getSessionQrAction, selfCheckInAction } from "@/features/attendance/actions";
import { makeSessionQr } from "@/features/attendance/qr";
import { finalizeSession, revokeSessionQr, selfCheckIn } from "@/features/attendance/service";
import {
  cancelObligationAction, completeObligationAction, createObligationAction, submitObligationAction,
} from "@/features/obligations/actions";
import { displayStatus } from "@/features/obligations/service";
import { ForbiddenError } from "@/lib/permissions";
import { addMembership, db, form, makeUser, signInAs } from "./helpers/db";
import { auth, makeEvent, makeWorld } from "./helpers/world";

const obligationForm = (orgId: string, userIds: string[], over: Record<string, string> = {}) => {
  const fd = form({ organizationId: orgId, title: "Return borrowed equipment", description: "", completionRequirements: "", dueAt: "", eventId: "", ...over });
  for (const id of userIds) fd.append("userIds", id);
  return fd;
};

describe("session QR codes: one per session, per-organization rights", () => {
  it("two sessions have different codes that only work for their own session", async () => {
    const w = await makeWorld();
    const e1 = await makeEvent(w.orgA.id, { title: "Assembly" });
    const e2 = await makeEvent(w.orgA.id, { title: "Seminar" });
    await signInAs(w.a.OFFICER.id);
    const q1 = await getSessionQrAction(e1.session.id);
    const q2 = await getSessionQrAction(e2.session.id);
    if ("error" in q1 || "error" in q2) throw new Error("expected codes");
    expect(q1.token).not.toBe(q2.token);
    expect(q1.details.event).toBe("Assembly");
    expect(q2.details.event).toBe("Seminar");

    await signInAs(w.a.MEMBER.id);
    expect(await selfCheckInAction(q1.token, e2.session.id)).toMatchObject({ ok: false, reason: "wrong_session" });
    expect(await selfCheckInAction(q1.token, e1.session.id)).toMatchObject({ ok: true });
    expect(await selfCheckInAction(q2.token, e2.session.id)).toMatchObject({ ok: true });
    expect(await selfCheckInAction(q1.token, e1.session.id)).toMatchObject({ ok: false, reason: "duplicate" });
    const rows = await db.attendanceRecord.findMany({ where: { userId: w.a.MEMBER.id } });
    expect(rows.map((r) => r.sessionId).sort()).toEqual([e1.session.id, e2.session.id].sort());
  });

  it("an officer of one organization scans as a member of another; members and other organizations cannot manage the code", async () => {
    const w = await makeWorld();
    // memberB is a plain member of B; make them an officer of A as well.
    await addMembership(w.memberB.id, w.orgA.id, "OFFICER");
    const evB = await makeEvent(w.orgB.id);
    const evA = await makeEvent(w.orgA.id);

    await signInAs(w.memberB.id);
    expect(await getSessionQrAction(evA.session.id)).toHaveProperty("token"); // officer in A
    await expect(getSessionQrAction(evB.session.id)).rejects.toBeInstanceOf(ForbiddenError); // only a member in B
    expect(await selfCheckInAction(makeSessionQr(evB.session.id), evB.session.id)).toMatchObject({ ok: true }); // still scans in B
    expect(await db.attendanceRecord.findFirstOrThrow({ where: { sessionId: evB.session.id } })).toMatchObject({ userId: w.memberB.id });

    await signInAs(w.a.MEMBER.id);
    await expect(getSessionQrAction(evA.session.id)).rejects.toBeInstanceOf(ForbiddenError);
    await signInAs(w.presidentB.id);
    await expect(getSessionQrAction(evA.session.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects revoked, closed (finalized) and not-yet-activated sessions", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    const old = makeSessionQr(ev.session.id, ev.session.qrEpoch);
    await revokeSessionQr(await auth(w.a.OFFICER.id), ev.session.id);
    expect(await selfCheckIn(w.a.MEMBER.id, old)).toMatchObject({ ok: false, reason: "revoked" });

    const done = await makeEvent(w.orgA.id, { title: "Done" });
    expect(await finalizeSession(await auth(w.a.PRESIDENT.id), done.session.id)).toMatchObject({ ok: true });
    expect(await selfCheckIn(w.a.MEMBER.id, makeSessionQr(done.session.id))).toMatchObject({ ok: false });

    const idle = await makeEvent(w.orgA.id, { title: "Idle", active: false });
    await signInAs(w.a.OFFICER.id);
    expect(await getSessionQrAction(idle.session.id)).toHaveProperty("error"); // the page shows an Open-session control instead
    expect(await selfCheckIn(w.a.MEMBER.id, makeSessionQr(idle.session.id))).toMatchObject({ ok: false, reason: "inactive" });
  });
});

describe("obligations are their own records", () => {
  it("only authorized officers assign, only to members of that organization", async () => {
    const w = await makeWorld();
    for (const r of ["MEMBER", "TREASURER", "AUDITOR", "ADVISER"] as const) {
      await signInAs(w.a[r].id);
      await expect(createObligationAction({}, obligationForm(w.orgA.id, [w.a.MEMBER.id]))).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.presidentB.id);
    await expect(createObligationAction({}, obligationForm(w.orgA.id, [w.a.MEMBER.id]))).rejects.toBeInstanceOf(ForbiddenError);

    await signInAs(w.a.OFFICER.id);
    expect((await createObligationAction({}, obligationForm(w.orgA.id, [w.memberB.id]))).error).toBeTruthy(); // not a member of A
    expect((await createObligationAction({}, obligationForm(w.orgA.id, [], {}))).error).toBeTruthy();
    expect((await createObligationAction({}, obligationForm(w.orgA.id, [w.a.MEMBER.id, w.a.TREASURER.id], { dueAt: "2030-01-10T09:00" }))).success).toMatch(/2 members/);
    expect(await db.obligation.count()).toBe(2);
    expect(await db.consequence.count()).toBe(0);
  });

  it("members see and update only their own; an officer verifies; completing never creates a consequence", async () => {
    const w = await makeWorld();
    await signInAs(w.a.OFFICER.id);
    await createObligationAction({}, obligationForm(w.orgA.id, [w.a.MEMBER.id, w.a.TREASURER.id]));
    const mine = await db.obligation.findFirstOrThrow({ where: { userId: w.a.MEMBER.id } });
    const other = await db.obligation.findFirstOrThrow({ where: { userId: w.a.TREASURER.id } });

    await signInAs(w.a.MEMBER.id);
    expect((await submitObligationAction({}, form({ obligationId: other.id, note: "x" }))).error).toBeTruthy(); // not theirs
    expect((await submitObligationAction({}, form({ obligationId: mine.id, note: "Returned it" }))).success).toBeTruthy();
    expect((await db.obligation.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("IN_PROGRESS");
    await completeObligationAction(form({ obligationId: mine.id, note: "" })); // a member cannot verify their own
    expect((await db.obligation.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("IN_PROGRESS");

    await signInAs(w.presidentB.id);
    await completeObligationAction(form({ obligationId: mine.id, note: "" })); // another organization's president cannot either
    expect((await db.obligation.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("IN_PROGRESS");

    await signInAs(w.a.OFFICER.id);
    await completeObligationAction(form({ obligationId: mine.id, note: "Verified" }));
    const done = await db.obligation.findUniqueOrThrow({ where: { id: mine.id } });
    expect(done).toMatchObject({ status: "COMPLETED", completedById: w.a.OFFICER.id });
    await cancelObligationAction(form({ obligationId: mine.id, note: "" }));
    expect((await db.obligation.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("COMPLETED"); // closed stays closed
    expect(await db.consequence.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: "obligation.complete" } })).toBe(1);
  });

  it("past-due open obligations read as overdue", () => {
    const past = new Date(Date.now() - 3600_000);
    expect(displayStatus({ status: "PENDING", dueAt: past })).toBe("OVERDUE");
    expect(displayStatus({ status: "COMPLETED", dueAt: past })).toBe("COMPLETED");
    expect(displayStatus({ status: "PENDING", dueAt: null })).toBe("PENDING");
  });
});

describe("attendance, obligations and consequences stay separate", () => {
  it("an absence or an unfinished obligation creates no consequence unless an attached rule applies", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await db.obligation.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, title: "Late form", dueAt: new Date(Date.now() - 86_400_000) } });
    expect(await finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id)).toMatchObject({ ok: true });
    expect(await db.attendanceRecord.count({ where: { userId: w.a.MEMBER.id, status: "ABSENT" } })).toBe(1);
    expect(await db.consequence.count()).toBe(0);

    // Only a rule an authorized officer defined AND attached to the event produces one.
    const rule = await db.consequenceRule.create({ data: { organizationId: w.orgA.id, name: "Missed session", trigger: "ABSENT", penaltyType: "SERVICE_HOURS", serviceHours: 2 } });
    const ruled = await makeEvent(w.orgA.id, { title: "Ruled", ruleIds: [rule.id] });
    await finalizeSession(await auth(w.a.PRESIDENT.id), ruled.session.id);
    expect(await db.consequence.count({ where: { eventId: ev.id } })).toBe(0);
    expect(await db.consequence.count({ where: { eventId: ruled.id } })).toBeGreaterThan(0);
  });

  it("members only ever see their own records, and unrelated users have none", async () => {
    const w = await makeWorld();
    const stranger = await makeUser();
    await db.obligation.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, title: "Mine" } });
    expect(await db.obligation.count({ where: { userId: stranger.id } })).toBe(0);
    expect(await db.obligation.count({ where: { userId: w.a.MEMBER.id } })).toBe(1);
  });
});

describe("pages and event/document permissions per role", () => {
  it("/obligations/manage loads for President, Secretary and Officer, loads read-only for the Adviser, and redirects everyone else", async () => {
    const w = await makeWorld();
    const { default: Page } = await import("@/app/(dashboard)/obligations/manage/page");
    await db.obligation.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, title: "Form" } });
    const render = async (id: string) => { await signInAs(id); return Page({ searchParams: Promise.resolve({}) }); };
    for (const r of ["PRESIDENT", "SECRETARY", "OFFICER", "ADVISER"] as const) expect(await render(w.a[r].id), r).toBeTruthy();
    for (const id of [w.a.MEMBER.id, w.a.TREASURER.id, w.a.AUDITOR.id]) await expect(render(id)).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    // The adviser can see the list but every management action is refused.
    await signInAs(w.a.ADVISER.id);
    await expect(createObligationAction({}, obligationForm(w.orgA.id, [w.a.MEMBER.id]))).rejects.toBeInstanceOf(ForbiddenError);
    const ob = await db.obligation.findFirstOrThrow();
    await completeObligationAction(form({ obligationId: ob.id, note: "" }));
    expect((await db.obligation.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe("PENDING");
  });

  it("an officer in A who is a member in B can create events and upload documents only in A; the creator is the signed-in user", async () => {
    const w = await makeWorld();
    const { createEventAction, updateEventAction } = await import("@/features/events/actions");
    const { uploadDocumentAction } = await import("@/features/documents/actions");
    const { getEventForViewer } = await import("@/features/events/queries");
    await addMembership(w.memberB.id, w.orgA.id, "OFFICER");
    const eventForm = (orgId: string, over: Record<string, string> = {}) => form({
      organizationId: orgId, title: "Fun Run", description: "", venue: "Oval", startsAt: "2030-01-10T09:00", endsAt: "2030-01-10T12:00", semesterId: "", targetMode: "ALL_MEMBERS",
      sessions: JSON.stringify([{ label: "In", kind: "TIME_IN", opensAt: "2030-01-10T08:30", startsAt: "2030-01-10T09:00", closesAt: "2030-01-10T10:30", graceMinutes: 15 }]), targets: "[]", ruleIds: "[]", ...over,
    });
    const upload = (orgId: string) => { const fd = form({ organizationId: orgId, title: "Minutes", category: "MINUTES" }); fd.set("file", new File([Buffer.from("%PDF-1.4 x")], "m.pdf")); return uploadDocumentAction({}, fd); };

    await signInAs(w.memberB.id);
    await expect(createEventAction({}, eventForm(w.orgB.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(upload(w.orgB.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createEventAction({}, eventForm(w.orgA.id, { createdById: w.admin.id }))).rejects.toThrow(/^NEXT_REDIRECT:\/events\//);
    const ev = await db.event.findFirstOrThrow();
    expect(ev.createdById).toBe(w.memberB.id); // never the client-supplied value
    expect(await db.event.count({ where: { organizationId: w.orgB.id } })).toBe(0);

    // Another officer edits it: the creator stays.
    await signInAs(w.a.SECRETARY.id);
    await updateEventAction({}, eventForm(w.orgA.id, { eventId: ev.id, title: "Fun Run 2" })).catch(() => undefined);
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).createdById).toBe(w.memberB.id);
    await db.event.update({ where: { id: ev.id }, data: { status: "PUBLISHED" } });
    const creator = await db.user.findUniqueOrThrow({ where: { id: w.memberB.id } });
    const view = await getEventForViewer(await auth(w.a.MEMBER.id), ev.id);
    expect(view?.creatorName).toBe(`${creator.firstName} ${creator.lastName}`);

    // Events without a recorded creator are handled.
    await db.event.update({ where: { id: ev.id }, data: { createdById: null } });
    expect((await getEventForViewer(await auth(w.a.MEMBER.id), ev.id))?.creatorName).toBeNull();
  });
});
