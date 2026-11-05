import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GET as downloadRoute } from "@/app/(dashboard)/documents/[id]/download/route";
import { uploadDocumentAction } from "@/features/documents/actions";
import { readBytes } from "@/features/documents/storage";
import { listOrgAttendance } from "@/features/attendance/queries";
import { adjustAttendanceAction } from "@/features/attendance/actions";
import { adviserOverview } from "@/features/dashboard/queries";
import { getParticipants } from "@/features/evaluations/queries";
import { getOrganizationForViewer } from "@/features/organizations/queries";
import { db, form, makeUser, addMembership, signInAs } from "./helpers/db";
import { auth, makeEvent, makeWorld } from "./helpers/world";
import { authState } from "./helpers/auth-state";

describe("attendance reasons are visible to the Adviser (and only to roles that oversee attendance)", () => {
  it("an excuse's reason, who changed it and when are shown on Attendance Records and the Adviser's dashboard", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id, { title: "General Assembly" });
    const rec = await db.attendanceRecord.create({ data: { eventId: ev.id, sessionId: ev.session.id, userId: w.a.MEMBER.id, status: "ABSENT", source: "SYSTEM" } });
    await signInAs(w.a.SECRETARY.id);
    expect((await adjustAttendanceAction({}, form({ recordId: rec.id, status: "EXCUSED", remark: "Medical certificate submitted" }))).error).toBeUndefined();
    const saved = await db.attendanceRecord.findUniqueOrThrow({ where: { id: rec.id } });
    expect(saved).toMatchObject({ status: "EXCUSED", remark: "Medical certificate submitted", modifiedById: w.a.SECRETARY.id, sessionId: ev.session.id });

    const adviserView = await listOrgAttendance(await auth(w.a.ADVISER.id), { page: 1 });
    const row = adviserView.rows.find((r) => r.id === rec.id)!;
    expect(row).toMatchObject({ remark: "Medical certificate submitted", status: "EXCUSED" });
    expect(row.modifiedBy).toContain("SECRETARY");
    const dash = await adviserOverview(await auth(w.a.ADVISER.id));
    expect(dash.reasons.map((r) => r.remark)).toEqual(["Medical certificate submitted"]);

    // Roles without attendance oversight, and other organizations' advisers, get nothing.
    for (const id of [w.a.MEMBER.id, w.a.TREASURER.id, w.a.AUDITOR.id, w.presidentB.id]) {
      expect((await listOrgAttendance(await auth(id), { page: 1 })).rows, id).toEqual([]);
      expect((await adviserOverview(await auth(id))).reasons, id).toEqual([]);
    }
    const otherAdviser = await makeUser({ name: "AdviserB" });
    await addMembership(otherAdviser.id, w.orgB.id, "ADVISER");
    expect((await listOrgAttendance(await auth(otherAdviser.id), { page: 1 })).rows).toEqual([]);
  });

  it("attendance filters (status, year level, search) combine in the database", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await db.studentProfile.create({ data: { userId: w.a.MEMBER.id, studentNumber: "2026-1111", yearLevel: 1 } });
    await db.studentProfile.create({ data: { userId: w.a.OFFICER.id, studentNumber: "2024-2222", yearLevel: 3 } });
    await db.attendanceRecord.createMany({ data: [
      { eventId: ev.id, sessionId: ev.session.id, userId: w.a.MEMBER.id, status: "PRESENT" },
      { eventId: ev.id, sessionId: ev.session.id, userId: w.a.OFFICER.id, status: "LATE" },
      { eventId: ev.id, sessionId: ev.session.id, userId: w.a.SECRETARY.id, status: "ABSENT" },
    ] });
    const adviser = await auth(w.a.ADVISER.id);
    const ids = async (f: Parameters<typeof listOrgAttendance>[1]) => (await listOrgAttendance(adviser, f)).rows.map((r) => r.user.studentProfile?.studentNumber ?? "none");
    expect(await ids({ page: 1, yearLevel: 3 })).toEqual(["2024-2222"]);
    expect(await ids({ page: 1, status: "PRESENT" })).toEqual(["2026-1111"]);
    expect(await ids({ page: 1, yearLevel: "none" })).toEqual(["none"]);
    expect(await ids({ page: 1, q: "2026-11", status: "LATE" })).toEqual([]);
    expect((await listOrgAttendance(adviser, { page: 1, q: "2026-11" })).total).toBe(1);
  });
});

describe("documents are stored in the database and survive a restart", () => {
  it("upload, then download after the server's disk is gone; size, type and permission checks", async () => {
    const w = await makeWorld();
    const storageDir = process.env.STORAGE_DIR!;
    const upload = (file: File, as = w.a.SECRETARY.id) => { const fd = form({ organizationId: w.orgA.id, title: "Minutes Jan", category: "MINUTES" }); fd.set("file", file); return signInAs(as).then(() => uploadDocumentAction({}, fd)); };
    const pdf = new File([Buffer.concat([Buffer.from("%PDF-1.4 "), Buffer.alloc(1_500_000, 65)])], "minutes.pdf"); // 1.5 MB: over the old 1 MB limit
    expect((await upload(pdf)).success).toMatch(/uploaded/);
    const doc = await db.document.findFirstOrThrow();
    const stored = await db.storedFile.findUniqueOrThrow({ where: { key: doc.storageKey } });
    expect([stored.byteSize, stored.mime]).toEqual([pdf.size, "application/pdf"]);
    expect(fs.existsSync(path.join(storageDir, doc.storageKey))).toBe(false); // nothing written to the server's disk
    await signInAs(w.a.MEMBER.id);
    const res = await downloadRoute(new Request("http://x"), { params: Promise.resolve({ id: doc.id }) });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).length).toBe(pdf.size);
    expect((await readBytes(doc.storageKey)).subarray(0, 8).toString()).toBe("%PDF-1.4");

    expect((await upload(new File([Buffer.alloc(4 * 1024 * 1024 + 1, 65)], "big.pdf"))).error).toMatch(/4 MB/);
    expect((await upload(new File([Buffer.from("MZ fake exe")], "virus.exe"))).error).toMatch(/not allowed/);
    expect((await upload(new File([Buffer.from("not a pdf")], "fake.pdf"))).error).toMatch(/do not match/);
    await expect(upload(pdf, w.a.MEMBER.id)).rejects.toThrow();
    await signInAs(w.presidentB.id);
    expect((await downloadRoute(new Request("http://x"), { params: Promise.resolve({ id: doc.id }) })).status).toBe(404);
    authState.user = null;
    expect(await db.document.count()).toBe(1);
  });
});

describe("evaluation participation and roster filters", () => {
  it("officers see who submitted (never what), filtered by year level, student status and submission", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    for (const [u, yl] of [[w.a.MEMBER, 1], [w.a.OFFICER, 3], [w.a.TREASURER, 3]] as const) await db.studentProfile.create({ data: { userId: u.id, studentNumber: `S-${yl}-${u.id.slice(0, 4)}`, yearLevel: yl } });
    await db.attendanceRecord.createMany({ data: [w.a.MEMBER, w.a.OFFICER, w.a.TREASURER].map((u) => ({ eventId: ev.id, sessionId: ev.session.id, userId: u.id, status: "PRESENT" as const })) });
    await db.user.update({ where: { id: w.a.TREASURER.id }, data: { status: "DISABLED" } });
    const formRow = await db.evaluationForm.create({ data: { organizationId: w.orgA.id, eventId: ev.id, title: "GA feedback", status: "OPEN" } });
    await db.evaluationResponse.create({ data: { formId: formRow.id, userId: w.a.OFFICER.id } });
    const president = await auth(w.a.PRESIDENT.id);
    const names = async (f: Parameters<typeof getParticipants>[2]) => (await getParticipants(president, formRow.id, f))!.rows.map((r) => `${r.name.split(", ")[1]}:${r.submitted ? "y" : "n"}`);
    const all = (await getParticipants(president, formRow.id, { page: 1 }))!;
    expect([all.attendees, all.submittedCount, all.total]).toEqual([3, 1, 3]);
    expect(JSON.stringify(all)).not.toMatch(/answer|ratingValue|textValue/);
    expect(await names({ page: 1, submitted: "no" })).toEqual(expect.arrayContaining(["MEMBER:n", "TREASURER:n"]));
    expect(await names({ page: 1, yearLevel: 3, submitted: "no" })).toEqual(["TREASURER:n"]);
    expect(await names({ page: 1, accountStatus: "DISABLED" })).toEqual(["TREASURER:n"]);
    expect(await names({ page: 1, accountStatus: "ACTIVE", yearLevel: 1 })).toEqual(["MEMBER:n"]);
    // Members (no results permission) and other organizations get nothing.
    expect(await getParticipants(await auth(w.a.MEMBER.id), formRow.id, { page: 1 })).toBeNull();
    expect(await getParticipants(await auth(w.presidentB.id), formRow.id, { page: 1 })).toBeNull();
    // The Adviser may view results (read-only) and so sees participation too.
    expect((await getParticipants(await auth(w.a.ADVISER.id), formRow.id, { page: 1 }))!.total).toBe(3);
  });

  it("the member roster filters by year level, student status, position and search, keeping the full count", async () => {
    const w = await makeWorld();
    await db.studentProfile.create({ data: { userId: w.a.MEMBER.id, studentNumber: "2026-0001", yearLevel: 2 } });
    await db.user.update({ where: { id: w.a.AUDITOR.id }, data: { status: "INVITED" } });
    const adviser = await auth(w.a.ADVISER.id);
    const view = (f: Parameters<typeof getOrganizationForViewer>[2]) => getOrganizationForViewer(adviser, w.orgA.id, f);
    expect((await view({}))!.members.length).toBe(7);
    const y2 = (await view({ yearLevel: 2 }))!;
    expect([y2.members.map((m) => m.role), y2.memberCount]).toEqual([["MEMBER"], 7]);
    expect((await view({ accountStatus: "INVITED" }))!.members.map((m) => m.role)).toEqual(["AUDITOR"]);
    expect((await view({ role: "TREASURER" }))!.members.length).toBe(1);
    expect((await view({ q: "2026-0001" }))!.members.map((m) => m.role)).toEqual(["MEMBER"]);
    expect((await view({}))!.members[0]).toHaveProperty("startedAt");
  });
});

describe("events list filters", () => {
  it("search, organization and status combine with the visibility rules (drafts only for managers)", async () => {
    const { listEvents } = await import("@/features/events/queries");
    const w = await makeWorld();
    const soon = { startsAt: new Date(Date.now() + 86400_000), endsAt: new Date(Date.now() + 90000_000), opens: new Date(Date.now() + 86000_000), closes: new Date(Date.now() + 90000_000) };
    await makeEvent(w.orgA.id, { title: "General Assembly", ...soon });
    await makeEvent(w.orgA.id, { title: "Planning (draft)", status: "DRAFT", ...soon });
    await makeEvent(w.orgB.id, { title: "Org B Assembly", ...soon });
    await addMembership(w.a.MEMBER.id, w.orgB.id, "MEMBER");
    const member = await auth(w.a.MEMBER.id);
    const titles = async (u: Awaited<ReturnType<typeof auth>>, f: Partial<Parameters<typeof listEvents>[1]>) => (await listEvents(u, { when: "upcoming", page: 1, ...f })).rows.map((e) => e.title).sort();
    expect(await titles(member, {})).toEqual(["General Assembly", "Org B Assembly"]); // the draft stays hidden from members
    expect(await titles(member, { q: "assembly", org: w.orgB.id })).toEqual(["Org B Assembly"]);
    expect(await titles(member, { status: "DRAFT" })).toEqual([]);
    expect(await titles(await auth(w.a.PRESIDENT.id), { status: "DRAFT" })).toEqual(["Planning (draft)"]);
    expect(await titles(member, { org: w.orgA.id, q: "zzz" })).toEqual([]);
  });
});
