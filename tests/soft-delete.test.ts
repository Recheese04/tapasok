import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/mobile/login/route";
import { GET as appEvents } from "@/app/api/mobile/org/[orgId]/events/route";
import { GET as appAnnouncements } from "@/app/api/mobile/org/[orgId]/announcements/route";
import { POST as appEventStatus } from "@/app/api/mobile/org/[orgId]/events/[id]/status/route";
import { GET as downloadRoute } from "@/app/(dashboard)/documents/[id]/download/route";
import { deleteEventAction, restoreEventAction, setEventStatusAction, updateEventAction } from "@/features/events/actions";
import { deleteAnnouncementAction, restoreAnnouncementAction, updateAnnouncementAction } from "@/features/announcements/actions";
import { removeDocumentAction, restoreDocumentAction } from "@/features/documents/actions";
import { deletedEvents, getEventForViewer, listEvents } from "@/features/events/queries";
import { memberDashboard } from "@/features/dashboard/queries";
import { memberAnnouncements } from "@/lib/mobile/queries";
import { ForbiddenError } from "@/lib/permissions";
import { db, form, signInAs } from "./helpers/db";
import { auth, makeEvent, makeWorld } from "./helpers/world";

const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
async function tokenFor(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const res = await login(new Request("http://localhost/api/mobile/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: "TestPassword1!" }) }));
  return (await res.json()).token as string;
}
const bearer = (t: string, body?: unknown) => new Request("http://localhost/api", { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

describe("soft delete: events", () => {
  it("a deleted draft is hidden from lists, details, dashboards and the app; it cannot be changed; managers restore it", async () => {
    const w = await makeWorld();
    const draft = await makeEvent(w.orgA.id, { status: "DRAFT", title: "Planning meeting", startsAt: new Date(Date.now() + 86400_000), opens: new Date(Date.now() + 86000_000), closes: new Date(Date.now() + 90000_000), endsAt: new Date(Date.now() + 90000_000) });
    const president = await auth(w.a.PRESIDENT.id);
    expect((await listEvents(president, { when: "upcoming", page: 1 })).rows.map((e) => e.title)).toContain("Planning meeting");

    await signInAs(w.a.PRESIDENT.id);
    await expect(deleteEventAction(form({ eventId: draft.id }))).rejects.toThrow("NEXT_REDIRECT:/events");
    const row = await db.event.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row).toMatchObject({ deletedById: w.a.PRESIDENT.id, status: "DRAFT", restoredAt: null });
    expect(row.deletedAt).toBeInstanceOf(Date);

    expect((await listEvents(president, { when: "upcoming", page: 1 })).rows.map((e) => e.title)).not.toContain("Planning meeting");
    expect(await getEventForViewer(president, draft.id)).toBeNull();
    expect((await memberDashboard(president)).upcoming.map((e) => e.id)).not.toContain(draft.id);
    const t = await tokenFor(w.a.PRESIDENT.id);
    const app = await (await appEvents(bearer(t), ctx({ orgId: w.orgA.id }))).json();
    expect(app.events.map((e: { id: string }) => e.id)).not.toContain(draft.id);
    expect((await appEventStatus(bearer(t, { status: "PUBLISHED" }), ctx({ orgId: w.orgA.id, id: draft.id }))).status).toBe(404);

    // A deleted event cannot be published, edited or deleted again.
    await setEventStatusAction(form({ eventId: draft.id, status: "PUBLISHED" }));
    expect((await updateEventAction({}, form({ eventId: draft.id, title: "Changed" }))).error).toMatch(/not found/);
    expect(await db.event.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "DRAFT", title: "Planning meeting" });

    // The "Recently deleted" list, and who may restore.
    expect((await deletedEvents(president)).map((e) => e.id)).toEqual([draft.id]);
    expect(await deletedEvents(await auth(w.a.MEMBER.id))).toEqual([]);
    for (const id of [w.a.MEMBER.id, w.a.ADVISER.id, w.presidentB.id]) {
      await signInAs(id);
      await expect(restoreEventAction(form({ eventId: draft.id }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.a.OFFICER.id); // events.manage
    await restoreEventAction(form({ eventId: draft.id }));
    const back = await db.event.findUniqueOrThrow({ where: { id: draft.id } });
    expect(back).toMatchObject({ deletedAt: null, deletedById: null, status: "DRAFT" });
    expect(back.restoredAt).toBeInstanceOf(Date);
    expect(await getEventForViewer(president, draft.id)).not.toBeNull();
    expect(await db.eventSession.count({ where: { eventId: draft.id } })).toBe(1); // came back complete
    const log = (await db.auditLog.findMany({ where: { targetId: draft.id }, orderBy: { createdAt: "asc" } })).map((l) => l.action);
    expect(log).toEqual(["event.delete", "event.restore"]);
  });

  it("an event with history is never deleted: attendance, fees and records stay exactly as they were", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await db.attendanceRecord.create({ data: { eventId: ev.id, sessionId: ev.session.id, userId: w.a.MEMBER.id, status: "PRESENT" } });
    const ft = await db.feeType.create({ data: { organizationId: w.orgA.id, name: "Event fee", amount: 50, eventId: ev.id } });
    await signInAs(w.a.PRESIDENT.id);
    await deleteEventAction(form({ eventId: ev.id }));
    expect(await db.event.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ deletedAt: null });
    expect(await db.attendanceRecord.count({ where: { eventId: ev.id } })).toBe(1);
    expect(await db.feeType.count({ where: { id: ft.id } })).toBe(1);
    // Even a direct soft delete in the database cannot cascade: rows referring to the event are untouched.
    await db.event.update({ where: { id: ev.id }, data: { deletedAt: new Date() } });
    expect(await db.attendanceRecord.count({ where: { eventId: ev.id } })).toBe(1);
  });
});

describe("soft delete: announcements and documents", () => {
  it("a deleted announcement disappears for members (web and app) and managers; restoring brings it back unchanged", async () => {
    const w = await makeWorld();
    const a = await db.announcement.create({ data: { organizationId: w.orgA.id, title: "Assembly moved", body: "Now at 3 PM", status: "PUBLISHED", publishedAt: new Date(), targetMode: "FILTERED", targets: { create: [{ yearLevel: 2 }] } } });
    const member = await auth(w.a.PRESIDENT.id);
    expect((await memberAnnouncements(member, 10)).map((x) => x.id)).toContain(a.id);

    await signInAs(w.a.SECRETARY.id);
    await deleteAnnouncementAction(form({ announcementId: a.id }));
    expect(await db.announcement.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ deletedById: w.a.SECRETARY.id });
    expect(await db.announcementTarget.count({ where: { announcementId: a.id } })).toBe(1); // audience kept for restoring
    expect((await memberAnnouncements(member, 10)).map((x) => x.id)).not.toContain(a.id);
    expect((await memberDashboard(member)).announcements.map((x) => x.id)).not.toContain(a.id);
    const t = await tokenFor(w.a.PRESIDENT.id);
    expect((await (await appAnnouncements(bearer(t), ctx({ orgId: w.orgA.id }))).json()).announcements).toEqual([]);
    expect((await updateAnnouncementAction({}, form({ announcementId: a.id, title: "Edited", body: "x", intent: "save", targetMode: "ALL_MEMBERS", targets: "[]", semesterId: "" }))).error).toMatch(/not found/);

    await signInAs(w.a.MEMBER.id);
    await expect(restoreAnnouncementAction(form({ announcementId: a.id }))).rejects.toBeInstanceOf(ForbiddenError);
    await signInAs(w.a.PRESIDENT.id);
    await restoreAnnouncementAction(form({ announcementId: a.id }));
    expect(await db.announcement.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ deletedAt: null, title: "Assembly moved", status: "PUBLISHED", targetMode: "FILTERED" });
    expect((await memberAnnouncements(member, 10)).map((x) => x.id)).toContain(a.id);
    expect(await db.notification.count({ where: { title: { contains: "Assembly moved" } } })).toBe(0); // restoring notifies nobody
  });

  it("a removed document cannot be downloaded until a manager restores it", async () => {
    const w = await makeWorld();
    const doc = await db.document.create({ data: { organizationId: w.orgA.id, title: "Minutes", fileName: "m.pdf", mimeType: "application/pdf", sizeBytes: 5, storageKey: "00000000-0000-4000-8000-00000000d0c5" } });
    await signInAs(w.a.SECRETARY.id);
    await removeDocumentAction(form({ documentId: doc.id }));
    expect(await db.document.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ deletedById: w.a.SECRETARY.id });
    await signInAs(w.a.MEMBER.id);
    expect((await downloadRoute(new Request("http://x"), { params: Promise.resolve({ id: doc.id }) })).status).toBe(404);
    await expect(restoreDocumentAction(form({ documentId: doc.id }))).rejects.toBeInstanceOf(ForbiddenError);
    await signInAs(w.a.SECRETARY.id);
    await restoreDocumentAction(form({ documentId: doc.id }));
    const back = await db.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(back).toMatchObject({ deletedAt: null, deletedById: null });
    expect(back.restoredAt).toBeInstanceOf(Date);
    expect((await db.auditLog.findMany({ where: { targetId: doc.id }, orderBy: { createdAt: "asc" } })).map((l) => l.action)).toEqual(["document.remove", "document.restore"]);
  });
});
