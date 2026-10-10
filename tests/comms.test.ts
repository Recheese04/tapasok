import { describe, expect, it } from "vitest";
import { createAnnouncementAction, updateAnnouncementAction } from "@/features/announcements/actions";
import { audienceMatches, recipientIds } from "@/features/announcements/service";
import { listNotifications, markAllRead, notify, unreadCount } from "@/features/notifications/service";
import { markAllReadAction } from "@/features/notifications/actions";
import { removeDocumentAction, uploadDocumentAction } from "@/features/documents/actions";
import { GET as downloadRoute } from "@/app/(dashboard)/documents/[id]/download/route";
import { ForbiddenError } from "@/lib/permissions";
import { addMembership, db, form, makeUser, signInAs } from "./helpers/db";
import { makeEvent, makeWorld } from "./helpers/world";


async function makeTerm() {
  const sy = await db.schoolYear.create({ data: { label: "2025-2026", startsOn: new Date("2025-06-01Z"), endsOn: new Date("2026-05-31Z"), active: true } });
  const sem = await db.semester.create({ data: { schoolYearId: sy.id, name: "1st Semester", sequence: 1, startsOn: new Date("2025-06-01Z"), endsOn: new Date("2025-10-31Z"), active: true } });
  return { sy, sem };
}

describe("announcements, audiences and notifications", () => {
  async function setup() {
    const w = await makeWorld();
    const { sem } = await makeTerm();
    const col = await db.college.create({ data: { code: "CAS", name: "CAS" } });
    const dep = await db.department.create({ data: { collegeId: col.id, code: "CS", name: "CS" } });
    const bsit = await db.program.create({ data: { departmentId: dep.id, code: "BSIT", name: "IT" } });
    const bsa = await db.program.create({ data: { departmentId: dep.id, code: "BSA", name: "Acct" } });
    await db.studentEnrollment.create({ data: { userId: w.a.MEMBER.id, semesterId: sem.id, programId: bsit.id, yearLevel: 1 } });
    await db.studentEnrollment.create({ data: { userId: w.a.TREASURER.id, semesterId: sem.id, programId: bsa.id, yearLevel: 1 } });
    return { w, sem, bsit, bsa };
  }
  const post = (orgId: string, over: Record<string, string> = {}) => form({ organizationId: orgId, title: "Notice", body: "Hello", intent: "publish", semesterId: "", targetMode: "ALL_MEMBERS", targets: "[]", ...over });

  it("publishing to everyone notifies every other member, once; drafts notify nobody", async () => {
    const { w } = await setup();
    await signInAs(w.a.PRESIDENT.id);
    await expect(createAnnouncementAction({}, post(w.orgA.id, { intent: "save" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(await db.notification.count()).toBe(0);
    await expect(createAnnouncementAction({}, post(w.orgA.id))).rejects.toThrow("NEXT_REDIRECT");
    expect(await db.notification.count({ where: { userId: w.a.MEMBER.id, kind: "announcement" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: w.a.PRESIDENT.id } })).toBe(0); // not the author
    expect(await db.notification.count({ where: { userId: w.presidentB.id } })).toBe(0); // another organization
    expect(await db.notification.count()).toBe(6);
  });

  it("targeted announcements reach matching students (plus overseers) and are hidden from the rest", async () => {
    const { w, bsit } = await setup();
    await signInAs(w.a.SECRETARY.id);
    await expect(createAnnouncementAction({}, post(w.orgA.id, { targetMode: "FILTERED", targets: JSON.stringify([{ programId: bsit.id, collegeId: "", departmentId: "", yearLevel: 1 }]) }))).rejects.toThrow("NEXT_REDIRECT");
    const a = await db.announcement.findFirstOrThrow({ include: { targets: true } });
    expect(a.targets).toHaveLength(1);
    const ids = await recipientIds(a.id);
    expect(ids).toContain(w.a.MEMBER.id); // BSIT year 1
    expect(ids).not.toContain(w.a.TREASURER.id); // BSA
    expect(ids).not.toContain(w.a.OFFICER.id); // no enrollment
    expect(ids).toEqual(expect.arrayContaining([w.a.PRESIDENT.id, w.a.SECRETARY.id, w.a.ADVISER.id])); // overseers
    expect(await audienceMatches(a, w.a.MEMBER.id, false)).toBe(true);
    expect(await audienceMatches(a, w.a.TREASURER.id, false)).toBe(false);
    expect(await audienceMatches(a, w.a.TREASURER.id, true)).toBe(true);
    expect(await db.notification.count({ where: { userId: w.a.TREASURER.id } })).toBe(0);
  });

  it("a filtered announcement needs at least one valid group", async () => {
    const { w } = await setup();
    await signInAs(w.a.PRESIDENT.id);
    expect((await createAnnouncementAction({}, post(w.orgA.id, { targetMode: "FILTERED", targets: "[]" }))).fieldErrors?.targets).toBeTruthy();
    expect((await createAnnouncementAction({}, post(w.orgA.id, { targetMode: "FILTERED", targets: "[{}]" }))).fieldErrors?.targets).toBeTruthy();
    expect(await db.announcement.count()).toBe(0);
  });

  it("publishing from a draft notifies exactly once", async () => {
    const { w } = await setup();
    await signInAs(w.a.PRESIDENT.id);
    await expect(createAnnouncementAction({}, post(w.orgA.id, { intent: "save" }))).rejects.toThrow("NEXT_REDIRECT");
    const a = await db.announcement.findFirstOrThrow();
    const up = (intent: string) => updateAnnouncementAction({}, form({ announcementId: a.id, title: "Notice", body: "Hello", intent, semesterId: "", targetMode: "ALL_MEMBERS", targets: "[]" }));
    await up("publish");
    await up("save");
    await up("publish");
    expect(await db.notification.count({ where: { userId: w.a.MEMBER.id } })).toBe(1);
    await signInAs(w.presidentB.id);
    await expect(up("publish")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("notifications are private to their owner", async () => {
    const w = await makeWorld();
    await notify([w.a.MEMBER.id, w.a.MEMBER.id], { kind: "test", title: "Hi" });
    await notify([w.a.TREASURER.id], { kind: "test", title: "Other" });
    expect(await unreadCount(w.a.MEMBER.id)).toBe(1); // de-duplicated per recipient
    expect((await listNotifications(w.a.TREASURER.id)).map((n) => n.title)).toEqual(["Other"]);
    await markAllRead(w.a.TREASURER.id);
    expect(await unreadCount(w.a.TREASURER.id)).toBe(0);
    expect(await unreadCount(w.a.MEMBER.id)).toBe(1); // untouched
    await signInAs(w.a.MEMBER.id);
    await markAllReadAction();
    expect(await unreadCount(w.a.MEMBER.id)).toBe(0);
  });
});

describe("minutes and archives", () => {
  const pdf = () => new File([Buffer.from("%PDF-1.4 minutes")], "minutes.pdf");
  const upload = (orgId: string, over: Record<string, string> = {}) => { const fd = form({ organizationId: orgId, title: "Minutes", category: "MINUTES", ...over }); fd.set("file", pdf()); return uploadDocumentAction({}, fd); };

  it("records category, term, event and an audit trail of uploads, downloads and removals", async () => {
    const w = await makeWorld();
    const { sem } = await makeTerm();
    const ev = await makeEvent(w.orgA.id);
    await signInAs(w.a.SECRETARY.id); // the secretary keeps the organization's records
    expect((await upload(w.orgA.id, { eventId: ev.id })).success).toBeTruthy();
    const doc = await db.document.findFirstOrThrow();
    expect(doc).toMatchObject({ category: "MINUTES", semesterId: sem.id, eventId: ev.id, uploadedById: w.a.SECRETARY.id });
    expect((await upload(w.orgA.id, { eventId: (await makeEvent(w.orgB.id, { title: "B" })).id })).error).toMatch(/event of this organization/);
    expect((await upload(w.orgA.id, { category: "BOGUS" })).error).toMatch(/category/);

    const get = () => downloadRoute(new Request("http://x"), { params: Promise.resolve({ id: doc.id }) });
    await signInAs(w.a.MEMBER.id);
    expect((await get()).status).toBe(200);
    await signInAs(w.a.SECRETARY.id);
    await removeDocumentAction(form({ documentId: doc.id }));
    const actions = (await db.auditLog.findMany({ where: { targetId: doc.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["document.upload", "document.download", "document.remove"]);
  });

  it("members cannot upload; presidents and secretaries can; other organizations cannot", async () => {
    const w = await makeWorld();
    for (const id of [w.a.MEMBER.id, w.a.TREASURER.id, w.a.OFFICER.id, w.a.ADVISER.id, w.presidentB.id, w.admin.id]) {
      await signInAs(id);
      await expect(upload(w.orgA.id)).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.a.PRESIDENT.id);
    expect((await upload(w.orgA.id)).success).toBeTruthy();
  });
});

void addMembership; void makeUser;
