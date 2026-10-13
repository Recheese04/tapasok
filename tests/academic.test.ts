import { describe, expect, it } from "vitest";
import { createCollegeAction, createDepartmentAction, setActiveTermAction } from "@/features/academic/actions";
import {
  academicTree, createCollege, createDepartment, createProgram, createSchoolYear, createSemester, getActiveTerm, setActiveTerm, setUnitActive,
} from "@/features/academic/service";
import { createOrganizationAction, addMemberAction, changeMemberRoleAction, endMembershipAction } from "@/features/organizations/actions";
import { createOrganization } from "@/features/organizations/service";
import { applyAutoMappingForUser, syncOrganizationMembers } from "@/features/organizations/mapping";
import { cancelJoinRequest, joinableOrganizations, joinOrganization } from "@/features/organizations/requests";
import { joinOrganizationAction } from "@/features/organizations/request-actions";
import { createStudentAction, updateStudentAction } from "@/features/students/actions";
import { importStudents } from "@/features/students/service";
import { ForbiddenError } from "@/lib/permissions";
import { addMembership, db, form, makeUser, signInAs } from "./helpers/db";
import { makeWorld } from "./helpers/world";

/** CAS > Computer Studies > BSIT, plus a second college/department/program, and an active 2025-2026 term. */
async function makeAcademic(adminId: string) {
  const ok = <T extends { ok: boolean }>(r: T) => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
  const cas = ok(await createCollege(adminId, { code: "CAS", name: "College of Arts and Sciences" }));
  const cbe = ok(await createCollege(adminId, { code: "CBE", name: "College of Business" }));
  const cs = ok(await createDepartment(adminId, { collegeId: cas.id, code: "CS", name: "Computer Studies" }));
  const math = ok(await createDepartment(adminId, { collegeId: cas.id, code: "MATH", name: "Mathematics" }));
  const acct = ok(await createDepartment(adminId, { collegeId: cbe.id, code: "ACCT", name: "Accountancy" }));
  const bsit = ok(await createProgram(adminId, { departmentId: cs.id, code: "BSIT", name: "BS Information Technology" }));
  const bscs = ok(await createProgram(adminId, { departmentId: cs.id, code: "BSCS", name: "BS Computer Science" }));
  const bsa = ok(await createProgram(adminId, { departmentId: acct.id, code: "BSA", name: "BS Accountancy" }));
  const sy = ok(await createSchoolYear(adminId, { label: "2025-2026", startsOn: new Date("2025-06-01Z"), endsOn: new Date("2026-05-31Z") }));
  const sem1 = ok(await createSemester(adminId, { schoolYearId: sy.id, name: "1st Semester", sequence: 1, startsOn: new Date("2025-06-01Z"), endsOn: new Date("2025-10-31Z") }));
  const sem2 = ok(await createSemester(adminId, { schoolYearId: sy.id, name: "2nd Semester", sequence: 2, startsOn: new Date("2025-11-01Z"), endsOn: new Date("2026-03-31Z") }));
  ok(await setActiveTerm(adminId, sem1.id));
  return { cas, cbe, cs, math, acct, bsit, bscs, bsa, sy, sem1, sem2 };
}

const studentForm = (a: Awaited<ReturnType<typeof makeAcademic>>, over: Record<string, string> = {}) =>
  form({ studentNumber: "2024-0001", firstName: "Ana", lastName: "Cruz", email: "ana@example.test", programId: a.bsit.id, yearLevel: "2", rfidUid: "", ...over });

describe("academic structure", () => {
  it("is configurable by system admins only", async () => {
    const w = await makeWorld();
    for (const id of [w.a.PRESIDENT.id, w.a.SECRETARY.id, w.a.ADVISER.id, w.a.MEMBER.id]) {
      await signInAs(id);
      await expect(createCollegeAction({}, form({ code: "XX", name: "Hack" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setActiveTermAction({}, form({ semesterId: w.orgA.id }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.admin.id);
    expect((await createCollegeAction({}, form({ code: "cas", name: "College of Arts" }))).success).toBeTruthy();
    expect((await db.college.findFirstOrThrow()).code).toBe("CAS"); // normalized
    expect((await createCollegeAction({}, form({ code: "CAS", name: "Another" }))).error).toMatch(/already exists/);
    expect((await createDepartmentAction({}, form({ collegeId: "not-a-uuid", code: "CS", name: "x" }))).fieldErrors?.collegeId).toBeTruthy();
  });

  it("keeps exactly one active term, activating the parent year, and never touches past terms", async () => {
    const w = await makeWorld();
    const a = await makeAcademic(w.admin.id);
    expect((await getActiveTerm())?.semester.id).toBe(a.sem1.id);

    await setActiveTerm(w.admin.id, a.sem2.id);
    expect((await getActiveTerm())?.semester.id).toBe(a.sem2.id);
    expect(await db.semester.count({ where: { active: true } })).toBe(1);
    expect(await db.schoolYear.count({ where: { active: true } })).toBe(1);

    // the database itself refuses two active semesters
    await expect(db.semester.update({ where: { id: a.sem1.id }, data: { active: true } })).rejects.toThrow();
  });

  it("validates dates, duplicates and hierarchy", async () => {
    const w = await makeWorld();
    const a = await makeAcademic(w.admin.id);
    expect(await createSchoolYear(w.admin.id, { label: "2026-2027", startsOn: new Date("2026-06-01Z"), endsOn: new Date("2026-01-01Z") })).toMatchObject({ ok: false });
    expect(await createSchoolYear(w.admin.id, { label: "2025-2026", startsOn: new Date("2025-06-01Z"), endsOn: new Date("2026-05-31Z") })).toMatchObject({ ok: false });
    expect(await createSemester(w.admin.id, { schoolYearId: a.sy.id, name: "Outside", sequence: 3, startsOn: new Date("2027-01-01Z"), endsOn: new Date("2027-03-01Z") })).toMatchObject({ ok: false });
    expect(await createSemester(w.admin.id, { schoolYearId: a.sy.id, name: "Dup", sequence: 1, startsOn: new Date("2025-06-01Z"), endsOn: new Date("2025-07-01Z") })).toMatchObject({ ok: false });
    expect(await createDepartment(w.admin.id, { collegeId: a.cas.id, code: "CS", name: "Other" })).toMatchObject({ ok: false });
    expect(await createProgram(w.admin.id, { departmentId: a.cs.id, code: "BSIT", name: "Other" })).toMatchObject({ ok: false });
  });

  it("archives instead of deleting; archived units leave selection lists but keep history", async () => {
    const w = await makeWorld();
    const a = await makeAcademic(w.admin.id);
    await setUnitActive(w.admin.id, "program", a.bscs.id, false);
    const names = (await academicTree()).flatMap((c) => c.departments.flatMap((d) => d.programs.map((p) => p.code)));
    expect(names).not.toContain("BSCS");
    expect((await academicTree(true)).flatMap((c) => c.departments.flatMap((d) => d.programs.map((p) => p.code)))).toContain("BSCS");
    expect(await createProgram(w.admin.id, { departmentId: a.cs.id, code: "X", name: "Y" })).toMatchObject({ ok: true });
    await setUnitActive(w.admin.id, "department", a.cs.id, false);
    expect(await createProgram(w.admin.id, { departmentId: a.cs.id, code: "Z", name: "Z" })).toMatchObject({ ok: false });
  });
});

describe("organizations: scope, academic links and adviser", () => {
  it("requires an official adviser and creates the adviser membership", async () => {
    const w = await makeWorld();
    const a = await makeAcademic(w.admin.id);
    const adviser = await makeUser({ email: "adviser@school.test" });
    const base = { name: "CS Society", acronym: null, description: null, scope: "DEPARTMENTAL" as const, collegeId: a.cas.id, departmentId: a.cs.id, programId: null, autoEnroll: false };
    expect(await createOrganization(w.admin.id, base, null)).toMatchObject({ ok: false, fieldErrors: { adviserEmail: expect.any(String) } });
    expect(await createOrganization(w.admin.id, base, "nobody@school.test")).toMatchObject({ ok: false });

    const res = await createOrganization(w.admin.id, base, "adviser@school.test");
    if (!res.ok) throw new Error(JSON.stringify(res));
    const m = await db.organizationMember.findFirstOrThrow({ where: { organizationId: res.id } });
    expect(m).toMatchObject({ userId: adviser.id, role: "ADVISER", endedAt: null });
  });

  it("enforces scope rules against the academic structure", async () => {
    const w = await makeWorld();
    const a = await makeAcademic(w.admin.id);
    await makeUser({ email: "adv@school.test" });
    const mk = (over: Record<string, unknown>) => createOrganization(w.admin.id, { name: `Org ${Math.random()}`, acronym: null, description: null, scope: "DEPARTMENTAL", collegeId: a.cas.id, departmentId: a.cs.id, programId: null, autoEnroll: false, ...over } as never, "adv@school.test");
    expect(await mk({ departmentId: null })).toMatchObject({ ok: false });
    expect(await mk({ departmentId: a.acct.id })).toMatchObject({ ok: false }); // department of another college
    expect(await mk({ programId: a.bsa.id })).toMatchObject({ ok: false }); // program of another department
    expect(await mk({ scope: "COLLEGE_WIDE", collegeId: null })).toMatchObject({ ok: false });
    expect(await mk({ scope: "DEPARTMENTAL", programId: a.bsit.id })).toMatchObject({ ok: true });
    const co = await mk({ scope: "CO_CURRICULAR", autoEnroll: true, collegeId: a.cas.id });
    if (!co.ok) throw new Error();
    expect(await db.organization.findUniqueOrThrow({ where: { id: co.id } })).toMatchObject({ scope: "CO_CURRICULAR", autoEnroll: false, collegeId: null });
    // the database also rejects inconsistent scope data
    await expect(db.organization.create({ data: { name: "Bad", scope: "DEPARTMENTAL" } })).rejects.toThrow();
  });

  it("only admins create organizations through the action", async () => {
    const w = await makeWorld();
    await signInAs(w.a.PRESIDENT.id);
    await expect(createOrganizationAction({}, form({ name: "Mine", scope: "CO_CURRICULAR", adviserEmail: "x@y.test" }))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("students: structured program, year level, RFID and history", () => {
  it("records the enrollment for the active semester and keeps earlier semesters", async () => {
    const w = await makeWorld();
    const a = await makeAcademic(w.admin.id);
    await signInAs(w.admin.id);
    expect((await createStudentAction({}, studentForm(a))).setupPath).toBeTruthy();
    const u = await db.user.findUniqueOrThrow({ where: { email: "ana@example.test" } });
    expect(await db.studentEnrollment.findMany({ where: { userId: u.id } })).toEqual([expect.objectContaining({ semesterId: a.sem1.id, programId: a.bsit.id, yearLevel: 2 })]);

    // next semester: the student moves to BSCS year 3; the old row is preserved
    await setActiveTerm(w.admin.id, a.sem2.id);
    await updateStudentAction({}, studentForm(a, { userId: u.id, programId: a.bscs.id, yearLevel: "3" }));
    const rows = await db.studentEnrollment.findMany({ where: { userId: u.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.semesterId, r.programId, r.yearLevel])).toEqual([[a.sem1.id, a.bsit.id, 2], [a.sem2.id, a.bscs.id, 3]]);
  });

  it("validates program, year level and RFID uniqueness", async () => {
    const w = await makeWorld();
    const a = await makeAcademic(w.admin.id);
    await signInAs(w.admin.id);
    expect((await createStudentAction({}, studentForm(a, { programId: "" }))).fieldErrors?.programId).toBeTruthy(); // year level without a program
    expect((await createStudentAction({}, studentForm(a, { yearLevel: "" }))).fieldErrors?.yearLevel).toBeTruthy();
    await setUnitActive(w.admin.id, "program", a.bscs.id, false);
    expect((await createStudentAction({}, studentForm(a, { programId: a.bscs.id }))).fieldErrors?.programId).toBeTruthy(); // archived
    expect((await createStudentAction({}, studentForm(a, { rfidUid: "xyz" }))).fieldErrors?.rfidUid).toBeTruthy();
    expect((await createStudentAction({}, studentForm(a, { rfidUid: "04a1b2c3" }))).setupPath).toBeTruthy();
    expect((await db.studentProfile.findFirstOrThrow()).rfidUid).toBe("04A1B2C3");
    expect((await createStudentAction({}, studentForm(a, { studentNumber: "2024-0002", email: "b@example.test", rfidUid: "04A1B2C3" }))).fieldErrors?.rfidUid).toMatch(/already assigned/);
  });

  it("imports program codes and flags unknown ones", async () => {
    const w = await makeWorld();
    await makeAcademic(w.admin.id);
    const csv = ["student_number,first_name,last_name,email,program_code,year_level,rfid_uid",
      "2024-0001,A,One,a@example.test,bsit,1,04A1B2C3", "2024-0002,B,Two,b@example.test,NOPE,1,", "2024-0003,C,Three,c@example.test,BSIT,,", "2024-0004,D,Four,d@example.test,BSIT,2,04A1B2C3"].join("\n");
    const r = await importStudents(w.admin.id, csv, false);
    if (!r.ok) throw new Error(r.error);
    expect(r.summary).toMatchObject({ total: 4, created: 1, failed: 3 });
    expect(r.summary.errors.map((e) => e.row)).toEqual([3, 4, 5]);
    expect(r.summary.errors[0].message).toMatch(/not an active program/);
    expect(await db.studentEnrollment.count()).toBe(1);
  });
});

describe("automatic academic mapping", () => {
  async function setup() {
    const w = await makeWorld();
    const a = await makeAcademic(w.admin.id);
    const adv = await makeUser({ email: "adv@school.test" });
    void adv;
    const mkOrg = async (name: string, over: Record<string, unknown>) => {
      const r = await createOrganization(w.admin.id, { name, acronym: null, description: null, scope: "DEPARTMENTAL", collegeId: a.cas.id, departmentId: a.cs.id, programId: null, autoEnroll: true, ...over } as never, "adv@school.test");
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.id;
    };
    const enrolled = async (email: string, programId: string, status: "ACTIVE" | "DISABLED" = "ACTIVE") => {
      const u = await makeUser({ email, status });
      await db.studentEnrollment.create({ data: { userId: u.id, semesterId: a.sem1.id, programId, yearLevel: 1 } });
      return u;
    };
    return { w, a, mkOrg, enrolled };
  }

  it("maps only students of the configured unit, as plain members with the term recorded, without duplicates", async () => {
    const { a, mkOrg, enrolled } = await setup();
    const csOrg = await mkOrg("CS Society", {});
    const sItA = await enrolled("it1@s.test", a.bsit.id);
    const sCs = await enrolled("cs1@s.test", a.bscs.id);
    const sAcct = await enrolled("ac1@s.test", a.bsa.id);
    const sOff = await enrolled("off@s.test", a.bsit.id, "DISABLED");

    expect(await syncOrganizationMembers(csOrg)).toBe(2);
    const rows = await db.organizationMember.findMany({ where: { organizationId: csOrg, source: "AUTO_MAPPING" } });
    expect(rows.map((r) => r.userId).sort()).toEqual([sItA.id, sCs.id].sort());
    for (const r of rows) expect(r).toMatchObject({ role: "MEMBER", semesterId: a.sem1.id, endedAt: null });
    expect(await db.organizationMember.count({ where: { userId: { in: [sAcct.id, sOff.id] } } })).toBe(0);
    expect(await syncOrganizationMembers(csOrg)).toBe(0); // idempotent
    expect(await db.organizationMember.count({ where: { organizationId: csOrg, userId: sItA.id } })).toBe(1);
  });

  it("respects the program filter, college-wide scope, and requires explicit opt-in", async () => {
    const { a, mkOrg, enrolled } = await setup();
    const itOnly = await mkOrg("IT Club", { programId: a.bsit.id });
    const casWide = await mkOrg("CAS Council", { scope: "COLLEGE_WIDE", departmentId: null });
    const optedOut = await mkOrg("Opted out", { autoEnroll: false });
    const sIt = await enrolled("it@s.test", a.bsit.id);
    const sCs = await enrolled("cs@s.test", a.bscs.id);
    const sBsa = await enrolled("bsa@s.test", a.bsa.id);

    await syncOrganizationMembers(itOnly); await syncOrganizationMembers(casWide); await syncOrganizationMembers(optedOut);
    const inOrg = async (org: string) => (await db.organizationMember.findMany({ where: { organizationId: org } })).map((m) => m.userId).filter((id) => [sIt.id, sCs.id, sBsa.id].includes(id)).sort();
    expect(await inOrg(itOnly)).toEqual([sIt.id]);
    expect(await inOrg(casWide)).toEqual([sIt.id, sCs.id].sort()); // BSA belongs to the other college
    expect(await inOrg(optedOut)).toEqual([]);
  });

  it("never auto-fills co-curricular organizations and applies on student changes", async () => {
    const { w, a, mkOrg } = await setup();
    const csOrg = await mkOrg("CS Society", {});
    const club = await mkOrg("Chess Club", { scope: "CO_CURRICULAR", collegeId: null, departmentId: null });
    await signInAs(w.admin.id);
    await createStudentAction({}, studentForm(a, { programId: a.bsit.id }));
    const u = await db.user.findUniqueOrThrow({ where: { email: "ana@example.test" } });
    expect(await db.organizationMember.count({ where: { organizationId: csOrg, userId: u.id, source: "AUTO_MAPPING" } })).toBe(1); // applied when saved
    expect(await db.organizationMember.count({ where: { organizationId: club, userId: u.id } })).toBe(0);
    expect(await applyAutoMappingForUser(u.id)).toBe(0);
  });
});

describe("joining an organization (immediate, no approval)", () => {
  async function setup() {
    const w = await makeWorld();
    const club = (await db.organization.create({ data: { name: "Chess Club", scope: "CO_CURRICULAR" } }));
    const mk = async (email: string, role: "PRESIDENT" | "SECRETARY" | "MEMBER") => { const u = await makeUser({ email }); await addMembership(u.id, club.id, role); return u; };
    const roles = { PRESIDENT: await mk("p@c.test", "PRESIDENT"), SECRETARY: await mk("s@c.test", "SECRETARY"), MEMBER: await mk("m@c.test", "MEMBER") };
    const student = await makeUser({ email: "stu@c.test" });
    return { w, club, roles, student };
  }

  it("a student joins a co-curricular organization at once, as a plain MEMBER, with the source and audit recorded", async () => {
    const { club, student } = await setup();
    await signInAs(student.id);
    expect(await joinOrganizationAction({}, form({ organizationId: club.id }))).toEqual({ success: "You joined Chess Club. You are now a member." });
    expect(await db.organizationMember.findFirstOrThrow({ where: { userId: student.id, organizationId: club.id } })).toMatchObject({ role: "MEMBER", source: "JOIN_REQUEST", endedAt: null, title: null });
    expect(await db.auditLog.count({ where: { action: "membership.join", actorUserId: student.id, targetId: club.id } })).toBe(1);
    expect(await db.joinRequest.count()).toBe(0); // no request record is needed any more
  });

  it("refuses duplicates (also two at once), non-interest-based and archived organizations, admins and deactivated accounts", async () => {
    const { w, club, roles, student } = await setup();
    const names = async () => (await joinableOrganizations(student.id)).map((o) => o.name);
    expect(await names()).toEqual(expect.arrayContaining(["Chess Club", "Org A", "Org B"]));
    const both = await Promise.all([joinOrganization(student.id, club.id), joinOrganization(student.id, club.id)]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(await joinOrganization(student.id, club.id)).toMatchObject({ ok: false, error: expect.stringMatching(/already a member/) });
    expect(await db.organizationMember.count({ where: { userId: student.id, organizationId: club.id, endedAt: null } })).toBe(1);
    expect(await names()).not.toContain("Chess Club");
    expect(await joinOrganization(roles.MEMBER.id, club.id)).toMatchObject({ ok: false });

    const dept = await db.organization.create({ data: { name: "Dept org", scope: "UNIVERSITY_WIDE" } });
    expect(await joinOrganization(student.id, dept.id)).toMatchObject({ ok: false, error: expect.stringMatching(/cannot be joined directly/) });
    expect(await names()).not.toContain("Dept org");
    const archived = await db.organization.create({ data: { name: "Old club", status: "ARCHIVED" } });
    expect(await joinOrganization(student.id, archived.id)).toMatchObject({ ok: false });
    expect(await joinOrganization(w.admin.id, club.id)).toMatchObject({ ok: false, error: expect.stringMatching(/manage organizations/) });
    const off = await makeUser({ status: "DISABLED" });
    expect(await joinOrganization(off.id, club.id)).toMatchObject({ ok: false });
    expect(await db.organizationMember.count({ where: { organizationId: { in: [dept.id, archived.id] } } })).toBe(0);
  });

  it("someone who left can join again; history keeps both memberships", async () => {
    const { club, student } = await setup();
    await joinOrganization(student.id, club.id);
    await db.organizationMember.updateMany({ where: { userId: student.id, organizationId: club.id }, data: { endedAt: new Date() } });
    expect(await joinOrganization(student.id, club.id)).toMatchObject({ ok: true });
    expect(await db.organizationMember.count({ where: { userId: student.id, organizationId: club.id } })).toBe(2);
  });

  it("an old pending request is kept and closed as accepted when the student joins; it can also be withdrawn", async () => {
    const { w, club, student } = await setup();
    const old = await db.joinRequest.create({ data: { organizationId: club.id, userId: student.id, message: "please" } });
    await joinOrganization(student.id, club.id);
    expect(await db.joinRequest.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ status: "APPROVED", decisionNote: "Joined directly", message: "please" });
    const other = await db.joinRequest.create({ data: { organizationId: w.orgA.id, userId: student.id } });
    expect(await cancelJoinRequest(w.a.PRESIDENT.id, other.id)).toMatchObject({ ok: false }); // only the requester
    expect(await cancelJoinRequest(student.id, other.id)).toEqual({ ok: true });
    expect((await db.joinRequest.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("CANCELLED");
    expect(await db.joinRequest.count()).toBe(2); // nothing deleted
  });
});

describe("officer positions", () => {
  it("the president assigns operational positions but not President/Adviser; changing a position keeps history", async () => {
    const w = await makeWorld();
    const target = await makeUser({ email: "t@x.test" });
    await signInAs(w.a.PRESIDENT.id);
    for (const role of ["SECRETARY", "TREASURER", "AUDITOR", "OFFICER", "MEMBER"]) {
      await db.organizationMember.deleteMany({ where: { userId: target.id } });
      expect((await addMemberAction({}, form({ organizationId: w.orgA.id, email: "t@x.test", role, title: "" }))).success).toBeTruthy();
    }
    await db.organizationMember.deleteMany({ where: { userId: target.id } });
    for (const role of ["ADVISER", "PRESIDENT"]) expect((await addMemberAction({}, form({ organizationId: w.orgA.id, email: "t@x.test", role, title: "" }))).error).toMatch(/system admin/);
    await addMemberAction({}, form({ organizationId: w.orgA.id, email: "t@x.test", role: "MEMBER", title: "" }));

    const m = await db.organizationMember.findFirstOrThrow({ where: { userId: target.id, endedAt: null } });
    await changeMemberRoleAction(form({ organizationId: w.orgA.id, membershipId: m.id, role: "TREASURER" }));
    await changeMemberRoleAction(form({ organizationId: w.orgA.id, membershipId: (await db.organizationMember.findFirstOrThrow({ where: { userId: target.id, endedAt: null } })).id, role: "ADVISER" })); // refused silently
    const history = await db.organizationMember.findMany({ where: { userId: target.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => [h.role, h.endedAt !== null])).toEqual([["MEMBER", true], ["TREASURER", false]]);
  });

  it("a president of another organization cannot change positions here; ending keeps history", async () => {
    const w = await makeWorld();
    const m = await db.organizationMember.findFirstOrThrow({ where: { userId: w.a.OFFICER.id } });
    await signInAs(w.presidentB.id);
    await expect(changeMemberRoleAction(form({ organizationId: w.orgA.id, membershipId: m.id, role: "MEMBER" }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(endMembershipAction(form({ organizationId: w.orgA.id, membershipId: m.id }))).rejects.toBeInstanceOf(ForbiddenError);
    await signInAs(w.a.PRESIDENT.id);
    await endMembershipAction(form({ organizationId: w.orgA.id, membershipId: m.id }));
    expect((await db.organizationMember.findUniqueOrThrow({ where: { id: m.id } })).endedAt).not.toBeNull();
  });
});
