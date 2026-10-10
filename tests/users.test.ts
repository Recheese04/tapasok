import { describe, expect, it } from "vitest";
import {
  assignMembershipAction,
  createAccountAction,
  setSystemAdminAction,
  setUserActiveAction,
  updateAccountAction,
} from "@/features/users/actions";
import { getUserForAdmin, listUsers } from "@/features/users/queries";
import { loginAction } from "@/features/auth/actions";
import { importStudents } from "@/features/students/service";
import { ForbiddenError } from "@/lib/permissions";
import { addMembership, db, form, makeOrg, makeUser, signInAs, TEST_PASSWORD } from "./helpers/db";

const studentForm = (over: Record<string, string> = {}) =>
  form({ accountType: "STUDENT", firstName: "Ana", lastName: "Cruz", email: "ana@test.local", studentNumber: "2024-0001", ...over });
const staffForm = (over: Record<string, string> = {}) =>
  form({ accountType: "STAFF", firstName: "Ben", lastName: "Reyes", email: "ben@test.local", employeeId: "EMP-001", ...over });
const plainForm = (over: Record<string, string> = {}) =>
  form({ accountType: "ACCOUNT_ONLY", firstName: "Cy", lastName: "Lim", email: "cy@test.local", ...over });

async function signInAsAdmin() {
  const admin = await makeUser({ systemRole: "SYSTEM_ADMIN", name: "Admin" });
  await signInAs(admin.id);
  return admin;
}

describe("user management: admin-only access", () => {
  it("rejects signed-out visitors", async () => {
    await expect(createAccountAction({}, studentForm())).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(await db.user.count()).toBe(0);
  });

  it("rejects members, presidents and other officers on every action and query", async () => {
    const org = await makeOrg();
    const target = await makeUser();
    for (const role of ["MEMBER", "TREASURER", "OFFICER", "ADVISER", "PRESIDENT"] as const) {
      const u = await makeUser();
      await addMembership(u.id, org.id, role);
      await signInAs(u.id);
      await expect(createAccountAction({}, studentForm({ email: `${role}@x.test` }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateAccountAction({}, form({ userId: target.id, firstName: "X", lastName: "Y", email: "x@y.test" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setUserActiveAction({}, form({ userId: target.id, active: "false" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setSystemAdminAction({}, form({ userId: target.id, makeAdmin: "true" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(assignMembershipAction({}, form({ userId: target.id, organizationId: org.id, role: "PRESIDENT", title: "" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listUsers()).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getUserForAdmin(target.id)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).systemRole).toBe("USER");
  });

  it("allows system admins", async () => {
    await signInAsAdmin();
    await expect(listUsers()).resolves.toBeDefined();
  });
});

describe("user management: one account type per profile, created through the setup flow", () => {
  it("creates student, staff and account-only accounts as INVITED with a setup link and no password", async () => {
    await signInAsAdmin();
    for (const f of [studentForm(), staffForm(), plainForm()]) {
      const res = await createAccountAction({}, f);
      expect(res.error).toBeUndefined();
      expect(res.setupPath).toMatch(/^\/activate\//);
    }
    const students = await db.user.findUniqueOrThrow({ where: { email: "ana@test.local" }, include: { studentProfile: true, staffProfile: true } });
    expect(students.status).toBe("INVITED");
    expect(students.systemRole).toBe("USER");
    expect(students.studentProfile?.studentNumber).toBe("2024-0001");
    const staff = await db.user.findUniqueOrThrow({ where: { email: "ben@test.local" }, include: { staffProfile: true } });
    expect(staff.staffProfile?.employeeId).toBe("EMP-001");
    expect(await db.organizationMember.count()).toBe(0);
  });

  it("never grants admin or positions on create, even with forged fields", async () => {
    await signInAsAdmin();
    await createAccountAction({}, studentForm({ systemRole: "SYSTEM_ADMIN", role: "PRESIDENT", password: "Hunter2Hunter2" }));
    const u = await db.user.findUniqueOrThrow({ where: { email: "ana@test.local" } });
    expect(u.systemRole).toBe("USER");
    expect(await db.organizationMember.count({ where: { userId: u.id } })).toBe(0);
    expect(u.passwordHash).not.toContain("Hunter2");
  });

  it("validates required fields and rejects duplicate email, student number and employee ID", async () => {
    await signInAsAdmin();
    expect((await createAccountAction({}, studentForm({ studentNumber: "" }))).fieldErrors?.studentNumber).toBeTruthy();
    expect((await createAccountAction({}, staffForm({ employeeId: "" }))).fieldErrors?.employeeId).toBeTruthy();
    expect((await createAccountAction({}, plainForm({ email: "nope" }))).fieldErrors?.email).toBeTruthy();

    await createAccountAction({}, studentForm());
    expect((await createAccountAction({}, studentForm({ studentNumber: "2024-0002", email: "ANA@test.local" }))).fieldErrors?.email).toBeTruthy();
    expect((await createAccountAction({}, studentForm({ email: "other@test.local" }))).fieldErrors?.studentNumber).toBeTruthy();
    await createAccountAction({}, staffForm());
    expect((await createAccountAction({}, staffForm({ email: "ben2@test.local" }))).fieldErrors?.employeeId).toBeTruthy();
  });

  it("updates details, keeps the profile type, and ignores forged system role", async () => {
    const admin = await signInAsAdmin();
    await createAccountAction({}, studentForm());
    const u = await db.user.findUniqueOrThrow({ where: { email: "ana@test.local" } });
    const res = await updateAccountAction({}, studentForm({ userId: u.id, firstName: "Anna", systemRole: "SYSTEM_ADMIN" }));
    expect(res.error).toBeUndefined();
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.firstName).toBe("Anna");
    expect(after.systemRole).toBe("USER");
    expect((await db.auditLog.findFirstOrThrow({ where: { action: "user.update" } })).actorUserId).toBe(admin.id);
  });
});

describe("user management: officer is the same account with different positions per organization", () => {
  it("assigns positions in several organizations to one account and lists them", async () => {
    await signInAsAdmin();
    const a = await makeOrg("Org A");
    const b = await makeOrg("Org B");
    const s = await makeUser({ email: "s@test.local" });
    await db.studentProfile.create({ data: { userId: s.id, studentNumber: "2024-0100" } });

    expect((await assignMembershipAction({}, form({ userId: s.id, organizationId: a.id, role: "OFFICER", title: "Attendance Officer" }))).success).toBeTruthy();
    expect((await assignMembershipAction({}, form({ userId: s.id, organizationId: b.id, role: "TREASURER", title: "" }))).success).toBeTruthy();
    expect((await assignMembershipAction({}, form({ userId: s.id, organizationId: a.id, role: "MEMBER", title: "" }))).error).toBeTruthy(); // already has a position in A

    const detail = await getUserForAdmin(s.id);
    expect(detail?.studentProfile?.studentNumber).toBe("2024-0100");
    expect(detail?.memberships.filter((m) => !m.endedAt).map((m) => `${m.organization.name}:${m.role}`).sort()).toEqual(["Org A:OFFICER", "Org B:TREASURER"]);
    expect(await db.user.count({ where: { id: s.id } })).toBe(1);

    const { rows } = await listUsers({ organizationId: b.id, role: "TREASURER" });
    expect(rows.map((r) => r.id)).toEqual([s.id]);
  });

  it("system admin is separate from positions and only granted explicitly", async () => {
    const admin = await signInAsAdmin();
    const org = await makeOrg();
    const pres = await makeUser();
    await addMembership(pres.id, org.id, "PRESIDENT");
    expect((await db.user.findUniqueOrThrow({ where: { id: pres.id } })).systemRole).toBe("USER");

    expect((await setSystemAdminAction({}, form({ userId: pres.id, makeAdmin: "true" }))).success).toBeTruthy();
    expect((await db.user.findUniqueOrThrow({ where: { id: pres.id } })).systemRole).toBe("SYSTEM_ADMIN");
    expect((await setSystemAdminAction({}, form({ userId: admin.id, makeAdmin: "false" }))).error).toMatch(/own/);
    const invited = await db.user.create({ data: { email: "inv@test.local", firstName: "I", lastName: "N", passwordHash: "x", status: "INVITED" } });
    expect((await setSystemAdminAction({}, form({ userId: invited.id, makeAdmin: "true" }))).error).toBeTruthy();
  });
});

describe("user management: deactivation", () => {
  it("deactivates, deletes sessions, audits, blocks login, and can be reactivated", async () => {
    const admin = await signInAsAdmin();
    const target = await makeUser({ email: "t@test.local" });
    await db.session.create({ data: { userId: target.id, tokenHash: "h1", expiresAt: new Date(Date.now() + 3_600_000) } });

    expect((await setUserActiveAction({}, form({ userId: target.id, active: "false" }))).success).toBeTruthy();
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("DISABLED");
    expect(await db.session.count({ where: { userId: target.id } })).toBe(0);
    expect((await db.auditLog.findFirstOrThrow({ where: { action: "user.deactivate" } })).actorUserId).toBe(admin.id);
    expect((await loginAction({}, form({ email: "t@test.local", password: TEST_PASSWORD }))).error).toBe("Invalid email or password.");

    await setUserActiveAction({}, form({ userId: target.id, active: "true" }));
    await expect(loginAction({}, form({ email: "t@test.local", password: TEST_PASSWORD }))).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("does not let an admin deactivate their own account", async () => {
    const admin = await signInAsAdmin();
    expect((await setUserActiveAction({}, form({ userId: admin.id, active: "false" }))).error).toMatch(/own account/);
  });
});

describe("user management: CSV import", () => {
  const header = "student_number,first_name,last_name,email,account_type,employee_id";

  it("imports students and staff, never admins, and reports duplicates and missing fields", async () => {
    const admin = await signInAsAdmin();
    const csv = [
      header,
      "2024-1001,Ann,One,ann@test.local,STUDENT,",
      ",Bob,Two,bob@test.local,STAFF,EMP-2",
      "2024-1001,Dup,Student,dup@test.local,STUDENT,",
      "2024-1003,,NoFirst,nf@test.local,STUDENT,",
      "2024-1004,Eve,Root,eve@test.local,SYSTEM_ADMIN,",
    ].join("\n");
    const res = await importStudents(admin.id, csv, false);
    expect(res.ok).toBe(true);
    expect(await db.user.count({ where: { email: { in: ["ann@test.local", "bob@test.local"] } } })).toBe(2);
    expect(await db.user.count({ where: { email: { in: ["dup@test.local", "nf@test.local", "eve@test.local"] } } })).toBe(0);
    expect(await db.user.count({ where: { systemRole: "SYSTEM_ADMIN" } })).toBe(1); // only the signed-in admin
    expect(await db.organizationMember.count()).toBe(0);
  });
});

describe("user management: data exposure", () => {
  it("never returns password hashes, tokens or lockout state", async () => {
    await signInAsAdmin();
    const { rows } = await listUsers();
    const detail = await getUserForAdmin(rows[0].id);
    for (const u of [...rows, detail!]) {
      expect(JSON.stringify(u)).not.toMatch(/passwordHash|failedLoginCount|lockedUntil|tokenHash/);
    }
  });
});
