import { describe, expect, it } from "vitest";
import { membershipCounts, studentPopulation, studentsInGroup } from "@/features/academic/population";
import { adminOrganizations, adminOrganizationDetails, adminOrganizationMembers } from "@/features/organizations/admin-queries";
import { listUsers, yearLevelsByProgram } from "@/features/users/queries";
import { ForbiddenError } from "@/lib/permissions";
import { addMembership, db, makeOrg, makeUser, signInAs } from "./helpers/db";

/**
 * Two colleges with real-looking but test-only programs (the app never hardcodes programs: everything below is read from
 * these records). Students: placed, missing a program, missing a year, deactivated; plus faculty, an admin and an
 * account-only user who must never be counted as students.
 */
async function school() {
  const admin = await makeUser({ systemRole: "SYSTEM_ADMIN", name: "Admin" });
  const c1 = await db.college.create({ data: { code: "C1", name: "College One" } });
  const c2 = await db.college.create({ data: { code: "C2", name: "College Two" } });
  const d1 = await db.department.create({ data: { collegeId: c1.id, code: "D1", name: "Dept One" } });
  const d2 = await db.department.create({ data: { collegeId: c2.id, code: "D2", name: "Dept Two" } });
  const pA = await db.program.create({ data: { departmentId: d1.id, code: "PA", name: "Program Alpha" } });
  const pB = await db.program.create({ data: { departmentId: d1.id, code: "PB", name: "Program Beta" } });
  const pC = await db.program.create({ data: { departmentId: d2.id, code: "PC", name: "Program Gamma" } });
  const pEmpty = await db.program.create({ data: { departmentId: d2.id, code: "PZ", name: "Program Zeta" } });
  const sy = await db.schoolYear.create({ data: { label: "2025-2026", startsOn: new Date("2025-06-01Z"), endsOn: new Date("2026-05-31Z") } });
  const past = await db.semester.create({ data: { schoolYearId: sy.id, name: "1st Semester", sequence: 1, startsOn: new Date("2025-06-01Z"), endsOn: new Date("2025-10-31Z") } });
  const now = await db.semester.create({ data: { schoolYearId: sy.id, name: "2nd Semester", sequence: 2, startsOn: new Date("2025-11-01Z"), endsOn: new Date("2026-03-31Z"), active: true } });

  let n = 0;
  const student = async (last: string, programId: string | null, yearLevel: number | null, status: "ACTIVE" | "DISABLED" = "ACTIVE") => {
    const u = await makeUser({ name: `S${++n}`, status });
    await db.user.update({ where: { id: u.id }, data: { lastName: last } });
    await db.studentProfile.create({ data: { userId: u.id, studentNumber: `2025-${String(n).padStart(4, "0")}`, programId, yearLevel } });
    return u;
  };
  const s = {
    a1: await student("Abad", pA.id, 1), a1b: await student("Bautista", pA.id, 1), a2: await student("Cruz", pA.id, 2),
    b3: await student("Dizon", pB.id, 3), c4: await student("Estrada", pC.id, 4),
    noProgram: await student("Flores", null, 2), noYear: await student("Garcia", pC.id, null),
    disabled: await student("Hernandez", pA.id, 1, "DISABLED"),
  };
  // The first semester recorded different placements for two students.
  await db.studentEnrollment.create({ data: { userId: s.a2.id, semesterId: past.id, programId: pB.id, yearLevel: 1 } });
  await db.studentEnrollment.create({ data: { userId: s.c4.id, semesterId: past.id, programId: pC.id, yearLevel: 3 } });

  const staff = await makeUser({ name: "Faculty" });
  await db.staffProfile.create({ data: { userId: staff.id, employeeId: "EMP-1", collegeId: c1.id, departmentId: d1.id } });
  const accountOnly = await makeUser({ name: "Visitor" });

  const org1 = await makeOrg("Chess Club");
  const org2 = await makeOrg("Debate Society");
  await addMembership(s.a1.id, org1.id, "PRESIDENT");
  await addMembership(s.a1.id, org2.id, "MEMBER"); // one student, two memberships
  await addMembership(s.b3.id, org1.id, "MEMBER");
  await addMembership(staff.id, org1.id, "ADVISER"); // not a student
  await db.organization.update({ where: { id: org2.id }, data: { scope: "DEPARTMENTAL", collegeId: c1.id, departmentId: d1.id } });
  return { admin, c1, c2, d1, d2, pA, pB, pC, pEmpty, past, now, s, staff, accountOnly, org1, org2 };
}

describe("student population (System Admin)", () => {
  it("counts unique students by year, program, department and college; unassigned groups are shown, non-students never", async () => {
    const w = await school();
    await signInAs(w.admin.id);
    const pop = await studentPopulation();
    expect(pop.total).toBe(7); // the deactivated student is left out by default; staff, admin and visitor are not students
    expect(pop.byYear).toEqual({ "1": 2, "2": 2, "3": 1, "4": 1, none: 1 });
    expect(pop.yearLevels).toEqual(["1", "2", "3", "4", "none"]);
    const prog = (id: string) => pop.programs.find((p) => p.id === id)!;
    expect(prog(w.pA.id)).toMatchObject({ total: 3, byYear: { "1": 2, "2": 1 }, collegeCode: "C1", departmentName: "Dept One" });
    expect(prog(w.pB.id)).toMatchObject({ total: 1, byYear: { "3": 1 } });
    expect(prog(w.pC.id)).toMatchObject({ total: 2, byYear: { "4": 1, none: 1 } });
    expect(prog(w.pEmpty.id)).toMatchObject({ total: 0, byYear: {} }); // programs without students still appear, with 0
    expect(pop.unassignedProgram).toEqual({ total: 1, byYear: { "2": 1 } });
    expect(pop.departments.find((d) => d.id === w.d1.id)?.total).toBe(4);
    expect(pop.departments.find((d) => d.id === w.d2.id)?.total).toBe(2);
    expect(pop.colleges.map((c) => [c.code, c.total])).toEqual([["C1", 4], ["C2", 2]]);
    // every student lands in exactly one program bucket (or unassigned), so the parts add up to the total
    expect(pop.programs.reduce((s, p) => s + p.total, 0) + pop.unassignedProgram.total).toBe(pop.total);
    expect(pop.counts).toEqual({ colleges: 2, departments: 2, programs: 4 });
    expect(pop.activeTermId).toBe(w.now.id);

    const all = await studentPopulation({ status: "all" });
    expect(all.total).toBe(8);
    expect(all.programs.find((p) => p.id === w.pA.id)?.byYear["1"]).toBe(3);
  });

  it("can show a past semester from the enrollment records instead of the current placement", async () => {
    const w = await school();
    await signInAs(w.admin.id);
    const pop = await studentPopulation({ basis: w.past.id });
    expect(pop.total).toBe(2); // only students with an enrollment in that semester
    expect(pop.programs.find((p) => p.id === w.pB.id)?.byYear).toEqual({ "1": 1 });
    expect(pop.programs.find((p) => p.id === w.pC.id)?.byYear).toEqual({ "3": 1 });
    const list = await studentsInGroup({ basis: w.past.id, programId: w.pB.id });
    expect(list.rows).toEqual([expect.objectContaining({ name: expect.stringContaining("Cruz"), yearLevel: 1, program: expect.stringContaining("PB") })]);
  });

  it("separates unique students in organizations from memberships", async () => {
    const w = await school();
    await signInAs(w.admin.id);
    expect(await membershipCounts()).toEqual({ memberships: 3, uniqueStudents: 2 }); // the adviser is not a student
    const orgs = await adminOrganizations({});
    const chess = orgs.rows.find((r) => r.id === w.org1.id)!;
    expect(chess).toMatchObject({ members: 3, students: 2, adviser: expect.stringContaining("Faculty") });
  });

  it("lists the students of a group with search and pagination, including the unassigned groups", async () => {
    const w = await school();
    await signInAs(w.admin.id);
    const names = async (f: Parameters<typeof studentsInGroup>[0]) => (await studentsInGroup(f)).rows.map((r) => r.name.split(",")[0]);
    expect(await names({ programId: w.pA.id, yearLevel: "1" })).toEqual(["Abad", "Bautista"]);
    expect(await names({ programId: "none" })).toEqual(["Flores"]);
    expect(await names({ yearLevel: "none" })).toEqual(["Garcia"]);
    expect(await names({ collegeId: w.c1.id })).toEqual(["Abad", "Bautista", "Cruz", "Dizon"]);
    expect(await names({ departmentId: w.d2.id })).toEqual(["Estrada", "Garcia"]);
    expect(await names({ collegeId: w.c1.id, q: "dizon" })).toEqual(["Dizon"]);
    expect(await names({ programId: w.pA.id, yearLevel: "1", status: "all" })).toEqual(["Abad", "Bautista", "Hernandez"]);
    const row = (await studentsInGroup({ programId: w.pA.id, yearLevel: "2" })).rows[0];
    expect(row).toEqual({ userId: w.s.a2.id, studentNumber: "2025-0003", name: expect.stringContaining("Cruz"), status: "ACTIVE", program: "PA · Program Alpha", unit: "C1 · Dept One", yearLevel: 2 });
    expect(Object.keys(row)).not.toContain("email"); // only what the list needs

    for (let i = 0; i < 27; i++) {
      const u = await makeUser({ name: `Bulk${i}` });
      await db.studentProfile.create({ data: { userId: u.id, studentNumber: `B-${String(i).padStart(3, "0")}`, programId: w.pEmpty.id, yearLevel: 1 } });
    }
    const p1 = await studentsInGroup({ programId: w.pEmpty.id }, 1);
    const p2 = await studentsInGroup({ programId: w.pEmpty.id }, 2);
    expect([p1.total, p1.rows.length, p2.rows.length]).toEqual([27, 25, 2]);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.userId)).size).toBe(27); // no overlap between pages
  });

  it("organization list: search, status and scope filters; details and members dialogs", async () => {
    const w = await school();
    await signInAs(w.admin.id);
    expect((await adminOrganizations({ q: "chess" })).rows.map((r) => r.name)).toEqual(["Chess Club"]);
    expect((await adminOrganizations({ scope: "DEPARTMENTAL" })).rows.map((r) => r.name)).toEqual(["Debate Society"]);
    await db.organization.update({ where: { id: w.org2.id }, data: { status: "ARCHIVED" } });
    const archived = await adminOrganizations({ status: "ARCHIVED" });
    expect(archived.rows.map((r) => r.name)).toEqual(["Debate Society"]);
    expect(archived.totals).toEqual({ active: 1, archived: 1 });
    const det = await adminOrganizationDetails(w.org1.id);
    expect(det).toMatchObject({ members: 3, students: 2, byRole: { PRESIDENT: 1, MEMBER: 1, ADVISER: 1 } });
    expect(det?.officers.map((o) => o.role).sort()).toEqual(["ADVISER", "PRESIDENT"]);
    expect((await adminOrganizationMembers(w.org1.id, { q: "dizon" })).rows.map((m) => m.user.lastName)).toEqual(["Dizon"]);
  });

  it("is System Admin only", async () => {
    const w = await school();
    await signInAs(w.s.a1.id); // a President of an organization, not an administrator
    await expect(studentPopulation()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(studentsInGroup({})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(membershipCounts()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adminOrganizations({})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adminOrganizationMembers(w.org1.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listUsers({ programId: w.pA.id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(yearLevelsByProgram()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("shows an empty, explained state when no programs are configured", async () => {
    const admin = await makeUser({ systemRole: "SYSTEM_ADMIN" });
    await signInAs(admin.id);
    const pop = await studentPopulation();
    expect(pop).toMatchObject({ total: 0, programs: [], colleges: [], counts: { colleges: 0, departments: 0, programs: 0 } });
  });
});

describe("User Management: academic filters, sorting, search and pagination", () => {
  const last = (rows: { lastName: string }[]) => rows.map((r) => r.lastName);

  it("filters by college, department, program and year level, alone and combined", async () => {
    const w = await school();
    await signInAs(w.admin.id);
    // college and department also match faculty/staff of that unit
    expect(last((await listUsers({ collegeId: w.c1.id })).rows)).toEqual(["Abad", "Bautista", "Cruz", "Dizon", "Hernandez", expect.stringMatching(/^Last/)]);
    expect(last((await listUsers({ collegeId: w.c1.id, type: "STUDENT" })).rows)).toEqual(["Abad", "Bautista", "Cruz", "Dizon", "Hernandez"]);
    expect(last((await listUsers({ departmentId: w.d2.id })).rows)).toEqual(["Estrada", "Garcia"]);
    expect(last((await listUsers({ programId: w.pA.id })).rows)).toEqual(["Abad", "Bautista", "Cruz", "Hernandez"]);
    expect(last((await listUsers({ programId: w.pA.id, yearLevel: "1", status: "ACTIVE" })).rows)).toEqual(["Abad", "Bautista"]);
    expect(last((await listUsers({ programId: "none" })).rows)).toEqual(["Flores"]);
    expect(last((await listUsers({ yearLevel: "none" })).rows)).toEqual(["Garcia"]);
    expect(last((await listUsers({ collegeId: w.c1.id, yearLevel: "3" })).rows)).toEqual(["Dizon"]);
    // search combined with filters
    expect(last((await listUsers({ collegeId: w.c1.id, q: "bau" })).rows)).toEqual(["Bautista"]);
    expect(last((await listUsers({ programId: w.pA.id, q: "2025-0004" })).rows)).toEqual([]); // that number is in another program
    // an id that matches nothing, and a contradictory combination, give an empty result rather than an error
    expect((await listUsers({ programId: "00000000-0000-4000-8000-000000000000" })).total).toBe(0);
    expect((await listUsers({ programId: w.pC.id, collegeId: w.c1.id })).total).toBe(0);
    // non-students are never matched by program or year level
    expect((await listUsers({ programId: w.pA.id })).rows.every((r) => r.studentProfile)).toBe(true);
    expect((await listUsers({ privilege: "SYSTEM_ADMIN" })).rows.map((r) => r.id)).toEqual([w.admin.id]);
    expect((await listUsers({ type: "STAFF" })).rows.map((r) => r.staffProfile?.employeeId)).toEqual(["EMP-1"]);
    expect((await listUsers({ organizationId: w.org1.id, role: "ADVISER" })).rows.map((r) => r.id)).toEqual([w.staff.id]);
  });

  it("sorts on the server in both directions; accounts without the value come last either way", async () => {
    const w = await school();
    await signInAs(w.admin.id);
    const sorted = async (sort: NonNullable<Parameters<typeof listUsers>[0]>["sort"], dir: "asc" | "desc", type?: "STUDENT") => last((await listUsers({ sort, dir, type })).rows);

    expect(await sorted("year", "asc", "STUDENT")).toEqual(["Abad", "Bautista", "Hernandez", "Cruz", "Flores", "Dizon", "Estrada", "Garcia"]);
    expect(await sorted("year", "desc", "STUDENT")).toEqual(["Estrada", "Dizon", "Cruz", "Flores", "Abad", "Bautista", "Hernandez", "Garcia"]);
    const progAsc = await listUsers({ sort: "program", dir: "asc" });
    // Program Alpha, then Beta, then Gamma (ties by name); then every account without a program (student Flores, the
    // admin, the faculty member, the visitor), by name
    expect(last(progAsc.rows).slice(0, 7)).toEqual(["Abad", "Bautista", "Cruz", "Hernandez", "Dizon", "Estrada", "Garcia"]);
    expect(progAsc.rows.slice(7).every((r) => !r.studentProfile?.program)).toBe(true);
    expect(progAsc.rows).toHaveLength(11);
    const progDesc = await sorted("program", "desc");
    expect(progDesc.slice(0, 2)).toEqual(["Estrada", "Garcia"]); // Program Gamma first when descending
    expect(progDesc.indexOf("Flores")).toBeGreaterThan(progDesc.indexOf("Hernandez")); // still last-ish: no value
    expect((await listUsers({ sort: "program", dir: "desc" })).rows.at(-1)?.studentProfile?.program).toBeFalsy();

    const collegeDesc = await listUsers({ sort: "college", dir: "desc" });
    expect(collegeDesc.rows[0].studentProfile?.program?.department.college.code).toBe("C2");
    expect(collegeDesc.rows.slice(-3).every((r) => !r.studentProfile?.program && !r.staffProfile?.college)).toBe(true); // admin, visitor, no-program student

    const numAsc = (await listUsers({ sort: "number", dir: "asc", type: "STUDENT" })).rows.map((r) => r.studentProfile?.studentNumber);
    expect(numAsc).toEqual([...numAsc].sort());
    const numDesc = (await listUsers({ sort: "number", dir: "desc", type: "STUDENT" })).rows.map((r) => r.studentProfile?.studentNumber);
    expect(numDesc).toEqual([...numAsc].reverse());

    const nameDesc = await sorted("name", "desc", "STUDENT");
    expect(nameDesc[0]).toBe("Hernandez");
    expect((await listUsers({ sort: "status", dir: "desc", type: "STUDENT" })).rows[0].status).toBe("DISABLED");
    const created = (await listUsers({ sort: "created", dir: "desc" })).rows.map((r) => r.createdAt.getTime());
    expect(created).toEqual([...created].sort((a, b) => b - a));
  });

  it("paginates after filtering and sorting without gaps or repeats, and offers only year levels that exist", async () => {
    const w = await school();
    await signInAs(w.admin.id);
    for (let i = 0; i < 30; i++) {
      const u = await makeUser({ name: `Bulk${i}` });
      await db.studentProfile.create({ data: { userId: u.id, studentNumber: `B-${String(i).padStart(3, "0")}`, programId: w.pB.id, yearLevel: (i % 2) + 1 } });
    }
    const f = { programId: w.pB.id, sort: "number" as const, dir: "desc" as const };
    const p1 = await listUsers(f, 1), p2 = await listUsers(f, 2);
    expect([p1.total, p1.rows.length, p2.rows.length]).toEqual([31, 25, 6]);
    const all = [...p1.rows, ...p2.rows].map((r) => r.studentProfile!.studentNumber);
    expect(new Set(all).size).toBe(31);
    expect(all).toEqual([...all].sort().reverse());
    const years = await yearLevelsByProgram();
    expect(years.byProgram[w.pB.id]).toEqual(["1", "2", "3"]);
    expect(years.byProgram[w.pC.id]).toEqual(["4", "none"]);
    expect(years.byProgram.none).toEqual(["2"]);
  });

  it("never returns credentials or session data", async () => {
    const w = await school();
    await signInAs(w.admin.id);
    for (const sort of ["name", "program"] as const) {
      const json = JSON.stringify(await listUsers({ sort }));
      expect(json).not.toMatch(/passwordHash|tokenHash|failedLoginCount|lockedUntil/);
    }
  });
});

describe("pages render for the System Admin with every view and filter", () => {
  it("Organizations (both tabs, dialogs) and User Management (filters, sorting)", async () => {
    const w = await school();
    const { AdminOrganizations } = await import("@/features/organizations/admin-view");
    const { GroupDialog } = await import("@/features/academic/population-section");
    const { default: Users } = await import("@/app/(dashboard)/users/page");
    await signInAs(w.admin.id);
    for (const sp of [{}, { tab: "students" }, { tab: "students", basis: w.past.id, college: w.c1.id }, { q: "chess", status: "ACTIVE" }, { view: w.org1.id }, { edit: w.org1.id }, { members: w.org1.id, mq: "a" }, { new: "1" }]) {
      expect(await AdminOrganizations({ sp })).toBeTruthy();
    }
    const pop = await studentPopulation();
    expect(await GroupDialog({ pop, filter: { programId: w.pA.id, yearLevel: "1" }, page: 1, href: () => "/organizations?tab=students", closeHref: "/organizations" })).toBeTruthy();
    for (const sp of [{}, { college: w.c1.id, dept: w.d1.id, program: w.pA.id, year: "1" }, { sort: "program", dir: "desc" }, { sort: "bogus", college: "not-a-uuid", year: "x" }]) {
      expect(await Users({ searchParams: Promise.resolve(sp) })).toBeTruthy();
    }
    // the organizations page sends a non-admin to their own organizations, never the admin dashboard
    const { default: Orgs } = await import("@/app/(dashboard)/organizations/page");
    await signInAs(w.s.a1.id);
    const el = await Orgs({ searchParams: Promise.resolve({ tab: "students" }) });
    expect((el as { type: unknown }).type).not.toBe(AdminOrganizations);
  });
});
