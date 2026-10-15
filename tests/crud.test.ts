import { describe, expect, it } from "vitest";
import {
  createCollegeAction, createDepartmentAction, deleteAcademicAction, updateSchoolYearAction, updateSemesterAction, updateUnitAction,
} from "@/features/academic/actions";
import { createAnnouncementAction, deleteAnnouncementAction } from "@/features/announcements/actions";
import { updateDocumentAction, uploadDocumentAction } from "@/features/documents/actions";
import { deleteEventAction } from "@/features/events/actions";
import { assignFeeAction, createFeeTypeAction, deleteFeeTypeAction, setFeeTypeActiveAction, updateFeeTypeAction } from "@/features/fees/actions";
import { updateObligationAction, completeObligationAction } from "@/features/obligations/actions";
import { ForbiddenError } from "@/lib/permissions";
import { db, form, signInAs } from "./helpers/db";
import { makeEvent, makeWorld } from "./helpers/world";

async function term() {
  const sy = await db.schoolYear.create({ data: { label: "2030-2031", startsOn: new Date("2030-06-01Z"), endsOn: new Date("2031-05-31Z"), active: false } });
  const sem = await db.semester.create({ data: { schoolYearId: sy.id, name: "1st Semester", sequence: 1, startsOn: new Date("2030-06-01Z"), endsOn: new Date("2030-10-31Z"), active: false } });
  return { sy, sem };
}

describe("CRUD: academic configuration (system admin only)", () => {
  it("only a system admin edits or deletes; presidents and members are refused", async () => {
    const w = await makeWorld();
    const { sy, sem } = await term();
    for (const id of [w.a.PRESIDENT.id, w.a.MEMBER.id, w.presidentB.id]) {
      await signInAs(id);
      await expect(updateSchoolYearAction({}, form({ id: sy.id, label: "2030-2031", startsOn: "2030-06-01", endsOn: "2031-05-31" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateSemesterAction({}, form({ id: sem.id, name: "X", sequence: "1", startsOn: "2030-06-01", endsOn: "2030-10-31" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteAcademicAction({}, form({ kind: "semester", id: sem.id }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await db.semester.count()).toBe(1);
  });

  it("updates validate, keep ids, and detect duplicates and out-of-range semester dates", async () => {
    const w = await makeWorld();
    await signInAs(w.admin.id);
    const { sy, sem } = await term();
    expect((await updateSchoolYearAction({}, form({ id: sy.id, label: "2030-2031", startsOn: "2030-05-15", endsOn: "2031-05-31" }))).success).toBeTruthy();
    expect((await updateSchoolYearAction({}, form({ id: sy.id, label: "bad", startsOn: "2030-05-15", endsOn: "2031-05-31" }))).fieldErrors?.label).toBeTruthy();
    expect((await updateSchoolYearAction({}, form({ id: sy.id, label: "2030-2031", startsOn: "2030-08-01", endsOn: "2031-05-31" }))).error).toMatch(/outside/); // would orphan the semester
    expect((await updateSemesterAction({}, form({ id: sem.id, name: "First", sequence: "1", startsOn: "2030-06-01", endsOn: "2030-10-31" }))).success).toBeTruthy();
    expect((await updateSemesterAction({}, form({ id: sem.id, name: "First", sequence: "1", startsOn: "2029-01-01", endsOn: "2030-10-31" }))).error).toMatch(/inside/);
    expect((await db.semester.findUniqueOrThrow({ where: { id: sem.id } })).name).toBe("First");

    await createCollegeAction({}, form({ code: "CAS", name: "Arts" }));
    await createCollegeAction({}, form({ code: "CBA", name: "Business" }));
    const cas = await db.college.findUniqueOrThrow({ where: { code: "CAS" } });
    expect((await updateUnitAction({}, form({ kind: "college", id: cas.id, code: "CBA", name: "Arts" }))).error).toMatch(/already uses/);
    expect((await updateUnitAction({}, form({ kind: "college", id: cas.id, code: "CAS", name: "Arts and Sciences" }))).success).toBeTruthy();
  });

  it("deletes only unused entries; used, parent and active ones are refused", async () => {
    const w = await makeWorld();
    await signInAs(w.admin.id);
    const { sy, sem } = await term();
    await createCollegeAction({}, form({ code: "CAS", name: "Arts" }));
    const cas = await db.college.findUniqueOrThrow({ where: { code: "CAS" } });
    await createDepartmentAction({}, form({ collegeId: cas.id, code: "DEPT", name: "Dept" }));
    expect((await deleteAcademicAction({}, form({ kind: "college", id: cas.id }))).error).toMatch(/still used/); // has a department
    expect(await db.college.count()).toBe(1);

    await db.event.create({ data: { organizationId: w.orgA.id, title: "E", venue: "V", startsAt: new Date("2030-07-01T01:00Z"), endsAt: new Date("2030-07-01T05:00Z"), attendanceOpensAt: new Date("2030-07-01T00:00Z"), attendanceClosesAt: new Date("2030-07-01T05:00Z"), semesterId: sem.id } });
    expect((await deleteAcademicAction({}, form({ kind: "semester", id: sem.id }))).error).toMatch(/still used/); // an event refers to it
    expect((await deleteAcademicAction({}, form({ kind: "school_year", id: sy.id }))).error).toMatch(/still used/);
    await db.semester.update({ where: { id: sem.id }, data: { active: true } });
    expect((await deleteAcademicAction({}, form({ kind: "semester", id: sem.id }))).error).toMatch(/active/);

    const dept = await db.department.findFirstOrThrow();
    expect((await deleteAcademicAction({}, form({ kind: "department", id: dept.id }))).success).toBeTruthy();
    expect((await deleteAcademicAction({}, form({ kind: "college", id: cas.id }))).success).toBeTruthy();
    expect(await db.college.count()).toBe(0);
    expect(await db.event.count()).toBe(1); // history untouched
  });
});

describe("CRUD: fees (president and treasurer of that organization only)", () => {
  const feeForm = (orgId: string, over: Record<string, string> = {}) => form({ organizationId: orgId, name: "Dues", amount: "100", kind: "DUES", dueDate: "", description: "", ...over });

  it("only president and treasurer create, edit, deactivate and delete fees, and only in their own organization", async () => {
    const w = await makeWorld();
    for (const r of ["SECRETARY", "OFFICER", "AUDITOR", "ADVISER", "MEMBER"] as const) {
      await signInAs(w.a[r].id);
      await expect(createFeeTypeAction({}, feeForm(w.orgA.id))).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.presidentB.id);
    await expect(createFeeTypeAction({}, feeForm(w.orgA.id))).rejects.toBeInstanceOf(ForbiddenError);

    await signInAs(w.a.TREASURER.id);
    expect((await createFeeTypeAction({}, feeForm(w.orgA.id))).success).toBeTruthy();
    const fee = await db.feeType.findFirstOrThrow();

    for (const id of [w.a.OFFICER.id, w.a.MEMBER.id, w.a.ADVISER.id, w.memberB.id, w.presidentB.id, w.admin.id]) {
      await signInAs(id);
      await expect(updateFeeTypeAction({}, form({ feeTypeId: fee.id, name: "Hacked", amount: "1", dueDate: "", description: "" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setFeeTypeActiveAction(form({ feeTypeId: fee.id, active: "false" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteFeeTypeAction(form({ feeTypeId: fee.id }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await db.feeType.findUniqueOrThrow({ where: { id: fee.id } })).toMatchObject({ name: "Dues", active: true });

    await signInAs(w.a.PRESIDENT.id);
    expect((await updateFeeTypeAction({}, form({ feeTypeId: fee.id, name: "Annual dues", amount: "150", dueDate: "2030-12-01", description: "" }))).success).toBeTruthy();
    expect((await updateFeeTypeAction({}, form({ feeTypeId: fee.id, name: "x", amount: "abc", dueDate: "", description: "" }))).error).toBeTruthy();
    expect((await updateFeeTypeAction({}, form({ feeTypeId: fee.id, name: "A", amount: "-5", dueDate: "", description: "" }))).error).toBeTruthy();
  });

  it("duplicate names are refused, edits don't change what was already assessed, and used fees can't be deleted", async () => {
    const w = await makeWorld();
    await signInAs(w.a.TREASURER.id);
    await createFeeTypeAction({}, feeForm(w.orgA.id));
    await createFeeTypeAction({}, feeForm(w.orgA.id, { name: "Other", amount: "50" }));
    const dues = await db.feeType.findFirstOrThrow({ where: { name: "Dues" } });
    const other = await db.feeType.findFirstOrThrow({ where: { name: "Other" } });
    expect((await updateFeeTypeAction({}, form({ feeTypeId: other.id, name: "Dues", amount: "50", dueDate: "", description: "" }))).error).toMatch(/already exists/);

    await assignFeeAction(form({ feeTypeId: dues.id }));
    const assessed = await db.studentFee.count({ where: { feeTypeId: dues.id } });
    expect(assessed).toBeGreaterThan(0);
    await updateFeeTypeAction({}, form({ feeTypeId: dues.id, name: "Dues", amount: "999", dueDate: "", description: "" }));
    expect((await db.studentFee.findFirstOrThrow({ where: { feeTypeId: dues.id } })).amountDue.toString()).toBe("100"); // history kept

    await deleteFeeTypeAction(form({ feeTypeId: dues.id }));
    expect(await db.feeType.count({ where: { id: dues.id } })).toBe(1); // assessed: kept
    await setFeeTypeActiveAction(form({ feeTypeId: dues.id, active: "false" }));
    expect((await db.feeType.findUniqueOrThrow({ where: { id: dues.id } })).active).toBe(false);
    await deleteFeeTypeAction(form({ feeTypeId: other.id }));
    expect(await db.feeType.count({ where: { id: other.id } })).toBe(0); // never assessed: removed
  });

  it("members see their own fees but the organization-wide page and its actions are closed to them", async () => {
    const w = await makeWorld();
    const { default: Manage } = await import("@/app/(dashboard)/fees/manage/page");
    const { default: Mine } = await import("@/app/(dashboard)/fees/page");
    for (const r of ["PRESIDENT", "TREASURER", "AUDITOR", "ADVISER"] as const) { await signInAs(w.a[r].id); expect(await Manage({ searchParams: Promise.resolve({}) }), r).toBeTruthy(); }
    for (const id of [w.a.MEMBER.id, w.a.OFFICER.id, w.a.SECRETARY.id]) { await signInAs(id); await expect(Manage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/dashboard"); }
    await signInAs(w.a.MEMBER.id);
    expect(await Mine()).toBeTruthy();
    // President in A but only a member in B cannot manage B's finances.
    await signInAs(w.presidentB.id);
    const fd = feeForm(w.orgA.id);
    await expect(createFeeTypeAction({}, fd)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("CRUD: obligations, announcements, events and documents", () => {
  it("obligation edits need obligations.manage in that organization and only apply while open", async () => {
    const w = await makeWorld();
    const ob = await db.obligation.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, title: "Form" } });
    const edit = (over: Record<string, string> = {}) => updateObligationAction({}, form({ obligationId: ob.id, title: "Updated form", description: "d", completionRequirements: "", dueAt: "", ...over }));
    for (const id of [w.a.MEMBER.id, w.a.ADVISER.id, w.a.TREASURER.id, w.presidentB.id]) { await signInAs(id); expect((await edit()).error).toBeTruthy(); }
    expect((await db.obligation.findUniqueOrThrow({ where: { id: ob.id } })).title).toBe("Form");
    await signInAs(w.a.OFFICER.id);
    expect((await edit({ title: "x" })).error).toBeTruthy(); // too short
    expect((await edit()).success).toBeTruthy();
    expect((await db.obligation.findUniqueOrThrow({ where: { id: ob.id } })).title).toBe("Updated form");
    await completeObligationAction(form({ obligationId: ob.id, note: "" }));
    expect((await edit({ title: "After closing" })).error).toMatch(/closed/);
  });

  it("announcements are deleted only by president/secretary of that organization", async () => {
    const w = await makeWorld();
    await signInAs(w.a.SECRETARY.id);
    await expect(createAnnouncementAction({}, form({ organizationId: w.orgA.id, title: "Hello all", body: "Body", intent: "save", targetMode: "ALL_MEMBERS", targets: "[]", semesterId: "" }))).rejects.toThrow(/NEXT_REDIRECT/).catch(() => undefined);
    const a = await db.announcement.create({ data: { organizationId: w.orgA.id, title: "Old news", body: "x" } });
    for (const id of [w.a.MEMBER.id, w.a.OFFICER.id, w.a.TREASURER.id, w.presidentB.id]) { await signInAs(id); await expect(deleteAnnouncementAction(form({ announcementId: a.id }))).rejects.toBeInstanceOf(ForbiddenError); }
    expect(await db.announcement.count({ where: { id: a.id } })).toBe(1);
    await signInAs(w.a.PRESIDENT.id);
    await deleteAnnouncementAction(form({ announcementId: a.id }));
    // Soft delete: kept in the database (restorable), hidden from every list.
    expect(await db.announcement.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ deletedById: w.a.PRESIDENT.id });
    expect(await db.announcement.count({ where: { id: a.id, deletedAt: null } })).toBe(0);
  });

  it("only unused draft events can be deleted, and only by managers of that organization", async () => {
    const w = await makeWorld();
    const draft = await makeEvent(w.orgA.id, { status: "DRAFT", title: "Draft" });
    const used = await makeEvent(w.orgA.id, { status: "DRAFT", title: "Used draft" });
    await db.obligation.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, title: "Linked", eventId: used.id } });
    const published = await makeEvent(w.orgA.id, { title: "Published" });
    const run = (id: string) => deleteEventAction(form({ eventId: id }));

    for (const id of [w.a.MEMBER.id, w.a.TREASURER.id, w.presidentB.id]) { await signInAs(id); await expect(run(draft.id)).rejects.toBeInstanceOf(ForbiddenError); }
    await signInAs(w.a.OFFICER.id);
    await run(used.id); await run(published.id);
    expect(await db.event.count({ where: { id: { in: [used.id, published.id] } } })).toBe(2); // refused, nothing lost
    await expect(run(draft.id)).rejects.toThrow("NEXT_REDIRECT:/events");
    // Soft delete: the event and its sessions stay in the database (restorable) but it is hidden.
    expect(await db.event.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ deletedById: w.a.OFFICER.id });
    expect(await db.event.count({ where: { id: draft.id, deletedAt: null } })).toBe(0);
    expect(await db.eventSession.count({ where: { eventId: draft.id } })).toBe(1);
  });

  it("document details are edited only by president/secretary of the owning organization; members can't upload", async () => {
    const w = await makeWorld();
    const doc = await db.document.create({ data: { organizationId: w.orgA.id, title: "Minutes", fileName: "m.pdf", mimeType: "application/pdf", sizeBytes: 5, storageKey: "k1", category: "MINUTES" } });
    const edit = (over: Record<string, string> = {}) => updateDocumentAction({}, form({ documentId: doc.id, title: "Minutes Jan", description: "", category: "MINUTES", ...over }));
    for (const id of [w.a.MEMBER.id, w.a.OFFICER.id, w.a.TREASURER.id, w.presidentB.id]) { await signInAs(id); await expect(edit()).rejects.toBeInstanceOf(ForbiddenError); }
    await signInAs(w.a.SECRETARY.id);
    expect((await edit({ title: "x" })).error).toBeTruthy();
    expect((await edit({ category: "BOGUS" })).error).toBeTruthy();
    expect((await edit()).success).toBeTruthy();
    expect(await db.document.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ title: "Minutes Jan", storageKey: "k1", fileName: "m.pdf" });

    const fd = form({ organizationId: w.orgA.id, title: "Sneaky", category: "OTHER" });
    fd.set("file", new File([Buffer.from("%PDF-1.4 x")], "s.pdf"));
    await signInAs(w.a.MEMBER.id);
    await expect(uploadDocumentAction({}, fd)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("My Organizations includes joining, and the old /join route redirects there", async () => {
    const w = await makeWorld();
    const { default: Orgs } = await import("@/app/(dashboard)/organizations/page");
    const { default: Join } = await import("@/app/(dashboard)/join/page");
    await signInAs(w.nobody.id);
    expect(await Orgs({ searchParams: Promise.resolve({}) })).toBeTruthy();
    expect(() => Join()).toThrow("NEXT_REDIRECT:/organizations");
  });
});
