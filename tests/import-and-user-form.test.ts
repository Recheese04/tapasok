import { describe, expect, it } from "vitest";
import { importStudentsAction } from "@/features/students/actions";
import { importStudents } from "@/features/students/service";
import { checkImportHeader, csvMessage, IMPORT_SPEC, REQUIRED_COLUMNS, templateCsv } from "@/features/students/import-spec";
import { createAccountAction, updateAccountAction } from "@/features/users/actions";
import { getUserForAdmin } from "@/features/users/queries";
import { userFormValues } from "@/features/users/user-modals";
import { ForbiddenError } from "@/lib/permissions";
import { db, form, makeUser, signInAs } from "./helpers/db";
import { makeWorld } from "./helpers/world";

const H = "first_name,last_name,email,student_number";
const run = async (csv: string, dry = true) => {
  const admin = await makeUser({ systemRole: "SYSTEM_ADMIN", email: `admin-${Math.random().toString(36).slice(2)}@t.local` });
  return importStudents(admin.id, csv, dry);
};
const summary = async (csv: string, dry = true) => {
  const r = await run(csv, dry);
  if (!r.ok) throw new Error(`file rejected: ${r.error}`);
  return r.summary;
};

async function academic() {
  const college = await db.college.create({ data: { code: "CS", name: "College of Sciences" } });
  const dept = await db.department.create({ data: { collegeId: college.id, code: "GEN", name: "General" } });
  const program = await db.program.create({ data: { departmentId: dept.id, code: "CS-P1", name: "BS Computer Science" } });
  return { college, dept, program };
}

describe("CSV import: the whole file is rejected for header problems", () => {
  it("missing required columns, no id column, duplicate columns, empty and header-only files", async () => {
    const rejected = async (csv: string) => { const r = await run(csv); return r.ok ? "accepted" : r.error; };
    expect(await rejected("first_name,last_name,student_number\nA,B,2026-1")).toMatch(/Missing required column\(s\): email/);
    expect(await rejected("last_name,email,student_number\nB,a@b.test,2026-1")).toMatch(/first_name/);
    expect(await rejected("first_name,last_name,email\nA,B,a@b.test")).toMatch(/student_number column/);
    expect(await rejected(`${H},email\nA,B,a@b.test,2026-1,x@y.test`)).toMatch(/Duplicate column\(s\): email/);
    expect(await rejected("")).toMatch(/empty/);
    expect(await rejected(`${H}\n`)).toMatch(/no student rows/);
    expect(await db.user.count({ where: { email: { contains: "b.test" } } })).toBe(0);
  });

  it("the screen and the server use the same header rules and the same required list", () => {
    expect(REQUIRED_COLUMNS).toEqual(["first_name", "last_name", "email"]);
    expect(checkImportHeader(["first_name", "last_name"])).toEqual([expect.stringMatching(/email/), expect.stringMatching(/student_number column/)]);
    expect(checkImportHeader(H.split(","))).toEqual([]);
    expect(csvMessage("studentNumber: too short; yearLevel: bad")).toBe("student_number: too short; year_level: bad");
    for (const c of IMPORT_SPEC) expect(["required", "conditional", "optional"]).toContain(c.need);
  });
});

describe("CSV import: row validation with row numbers and column names", () => {
  it("reports blank required values, bad formats, unknown references and forbidden account types per row", async () => {
    await academic();
    const csv = [
      "first_name,last_name,email,student_number,account_type,employee_id,program_code,year_level,rfid_uid,contact_number,college_code,department_code",
      ",Cruz,a@x.test,2026-1,,,,,,,,", // 2 blank first name
      "Ana,Cruz,,2026-2,,,,,,,,", // 3 blank email
      "Ana,Cruz,not-an-email,2026-3,,,,,,,,", // 4 bad email
      "Ana,Cruz,b@x.test,,,,,,,,,", // 5 blank student number
      "Ana,Cruz,c@x.test,2026-6,,,NOPE,,,,,", // 6 unknown program
      "Ana,Cruz,d@x.test,2026-7,,,,99,,,,", // 7 year level
      "Ana,Cruz,e@x.test,2026-8,,,,,ZZZ,,,", // 8 rfid
      "Ana,Cruz,f@x.test,2026-9,,,,,,12345,,", // 9 contact
      "Ben,Reyes,g@x.test,,STAFF,,,,,,,", // 10 staff without employee id
      "Ben,Reyes,h@x.test,,STAFF,EMP-1,,,,,NOCOLLEGE,", // 11 unknown college
      "Ben,Reyes,i@x.test,,STAFF,EMP-2,,,,,,GEN", // 12 department without college
      "Root,Admin,j@x.test,2026-10,SYSTEM_ADMIN,,,,,,,", // 13 forbidden type
      "Okay,Person,k@x.test,2026-11,,,CS-P1,1,04A1B2C3,09171234567,,", // 14 valid
    ].join("\n");
    const s = await summary(csv);
    const byRow = new Map(s.errors.map((e) => [e.row, e.message]));
    expect(byRow.get(2)).toMatch(/^first_name:/);
    expect(byRow.get(3)).toMatch(/^email:/);
    expect(byRow.get(4)).toMatch(/^email:/);
    expect(byRow.get(5)).toMatch(/^student_number:/);
    expect(byRow.get(6)).toMatch(/program_code: "NOPE" is not an active program/);
    expect(byRow.get(7)).toMatch(/^year_level:/);
    expect(byRow.get(8)).toMatch(/^rfid_uid:/);
    expect(byRow.get(9)).toMatch(/^contact_number:/);
    expect(byRow.get(10)).toMatch(/employee_id/);
    expect(byRow.get(11)).toMatch(/college_code: "NOCOLLEGE"/);
    expect(byRow.get(12)).toMatch(/department_code needs a college_code/);
    expect(byRow.get(13)).toMatch(/account_type must be STUDENT or STAFF/);
    expect(byRow.has(14)).toBe(false);
    expect(s).toMatchObject({ dryRun: true, total: 13, created: 1, failed: 12 });
    expect(s.created + s.failed).toBe(s.total); // nothing is silently skipped
    expect(s.preview).toHaveLength(13);
    expect(s.preview.find((r) => r.row === 14)?.ok).toBe(true);
    expect(s.preview.find((r) => r.row === 2)?.ok).toBe(false);
    expect(await db.user.count({ where: { email: { endsWith: "@x.test" } } })).toBe(0); // checking saves nothing
  });

  it("detects duplicates inside the file and against existing accounts, and never overwrites", async () => {
    await makeUser({ email: "taken@x.test" });
    const existing = await makeUser({ email: "someone@x.test" });
    await db.studentProfile.create({ data: { userId: existing.id, studentNumber: "2026-77" } });
    const csv = [
      "first_name,last_name,email,student_number,account_type,employee_id",
      "A,A,a1@x.test,2026-1,,", // 2 ok
      "B,B,a1@x.test,2026-2,,", // 3 duplicate email in file
      "C,C,c@x.test,2026-1,,", // 4 duplicate student number in file
      "D,D,taken@x.test,2026-3,,", // 5 email already exists
      "E,E,e@x.test,2026-77,,", // 6 student number already exists
      "F,F,f@x.test,,STAFF,EMP-1", // 7 ok
      "G,G,g@x.test,,STAFF,EMP-1", // 8 duplicate employee id in file
    ].join("\n");
    const s = await summary(csv);
    const byRow = new Map(s.errors.map((e) => [e.row, e.message]));
    expect(byRow.get(3)).toMatch(/Duplicate email \(also on row 2\)/);
    expect(byRow.get(4)).toMatch(/Duplicate student number \(also on row 2\)/);
    expect(byRow.get(5)).toMatch(/already exists/);
    expect(byRow.get(6)).toMatch(/already exists/);
    expect(byRow.get(8)).toMatch(/Duplicate employee ID \(also on row 7\)/);
    expect([s.created, s.failed]).toEqual([2, 5]);
    expect((await db.studentProfile.findUniqueOrThrow({ where: { userId: existing.id } })).studentNumber).toBe("2026-77");
  });

  it("imports only the valid rows, reports the rest as not imported, and never grants privileges", async () => {
    await academic();
    const csv = [
      "first_name,last_name,email,student_number,role,system_role,position",
      "Ana,Cruz,ana@x.test,2026-1,PRESIDENT,SYSTEM_ADMIN,Treasurer",
      "Bad,Row,not-an-email,2026-2,,,",
    ].join("\n");
    const dry = await summary(csv, true);
    expect(dry.ignoredColumns).toEqual(["role", "system_role", "position"]);
    const real = await summary(csv, false);
    expect(real).toMatchObject({ dryRun: false, total: 2, created: 1, failed: 1 });
    expect(real.errors[0].row).toBe(3);
    expect(real.links).toHaveLength(1);
    const ana = await db.user.findUniqueOrThrow({ where: { email: "ana@x.test" } });
    expect(ana).toMatchObject({ status: "INVITED", systemRole: "USER" });
    expect(await db.organizationMember.count({ where: { userId: ana.id } })).toBe(0);
    expect(await db.user.count({ where: { email: "not-an-email" } })).toBe(0);
  });

  it("the downloadable template is itself a valid file", async () => {
    await academic();
    const t = templateCsv();
    const header = t.split("\r\n")[0].split(",");
    expect(header).toEqual(IMPORT_SPEC.map((c) => c.name));
    const s = await summary(t);
    expect(s).toMatchObject({ total: 2, created: 2, failed: 0 });
  });

  it("only system administrators can run an import through the action", async () => {
    const w = await makeWorld();
    const fd = form({ intent: "import" });
    fd.set("file", new File([`${H}\nA,B,a@b.test,2026-1`], "people.csv", { type: "text/csv" }));
    for (const id of [w.a.PRESIDENT.id, w.a.MEMBER.id, w.presidentB.id]) {
      await signInAs(id);
      await expect(importStudentsAction({}, fd)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await db.user.count({ where: { email: "a@b.test" } })).toBe(0);
    await signInAs(w.admin.id);
    expect((await importStudentsAction({}, fd)).summary?.created).toBe(1);
    const bad = form({ intent: "import" });
    bad.set("file", new File(["x"], "people.txt"));
    expect((await importStudentsAction({}, bad)).error).toMatch(/\.csv/);
  });
});

describe("User form: every field saves, reopens, validates and is permission-checked", () => {
  const studentForm = (programId: string, over: Record<string, string> = {}) => form({
    accountType: "STUDENT", firstName: "Maria", lastName: "Santos", middleName: "Cruz", email: "maria@x.test", studentNumber: "2026-1111", yearLevel: "2",
    contactNumber: "09171234567", rfidUid: "04A1B2C3", programId, streetAddress: "12 Rizal St", regionCode: "", provinceCode: "", cityCode: "", barangayCode: "", ...over,
  });

  it("creates a student with no address (the address is optional), then edits every field and sees it again when reopened", async () => {
    const w = await makeWorld();
    const { program } = await academic();
    const other = await db.program.create({ data: { departmentId: program.departmentId, code: "CS-P2", name: "BS Environmental Science" } });
    await signInAs(w.admin.id);
    const created = await createAccountAction({}, studentForm(program.id));
    expect(created.error).toBeUndefined();
    expect(created.fieldErrors).toBeUndefined();
    const id = created.userId!;

    let full = (await getUserForAdmin(id))!;
    expect(userFormValues(full)).toMatchObject({ firstName: "Maria", middleName: "Cruz", studentNumber: "2026-1111", yearLevel: 2, contactNumber: "09171234567", rfidUid: "04A1B2C3", programId: program.id, streetAddress: "12 Rizal St", regionCode: null });

    const edited = await updateAccountAction({}, studentForm(other.id, {
      userId: id, firstName: "Mariana", lastName: "Santos-Reyes", middleName: "", email: "mariana@x.test", studentNumber: "2026-2222", yearLevel: "3",
      contactNumber: "09181234567", rfidUid: "04FFEE11", streetAddress: "99 Mabini Ave",
    }));
    expect(edited).toEqual({ success: "Saved." });
    full = (await getUserForAdmin(id))!;
    expect(userFormValues(full)).toMatchObject({
      firstName: "Mariana", lastName: "Santos-Reyes", middleName: null, email: "mariana@x.test", studentNumber: "2026-2222", yearLevel: 3,
      contactNumber: "09181234567", rfidUid: "04FFEE11", programId: other.id, streetAddress: "99 Mabini Ave",
    });
    // history stays intact: the account is the same row, still a student, still no privileges
    expect(full).toMatchObject({ id, systemRole: "USER", status: "INVITED" });
  });

  it("validates required fields, formats and uniqueness with field-level messages", async () => {
    const w = await makeWorld();
    const { program } = await academic();
    await signInAs(w.admin.id);
    const ok = await createAccountAction({}, studentForm(program.id));
    const bad = async (over: Record<string, string>) => (await createAccountAction({}, studentForm(program.id, { email: "other@x.test", studentNumber: "2026-5555", rfidUid: "", ...over }))).fieldErrors ?? {};
    expect(ok.userId).toBeTruthy();
    expect((await bad({ firstName: "" })).firstName).toBeTruthy();
    expect((await bad({ email: "nope" })).email).toBeTruthy();
    expect((await bad({ studentNumber: "" })).studentNumber).toBeTruthy();
    expect((await bad({ yearLevel: "99" })).yearLevel).toBeTruthy();
    expect((await bad({ contactNumber: "123" })).contactNumber).toBeTruthy();
    expect((await bad({ rfidUid: "xyz" })).rfidUid).toBeTruthy();
    expect((await bad({ email: "maria@x.test" })).email).toBeTruthy(); // duplicate email
    expect((await bad({ studentNumber: "2026-1111" })).studentNumber).toBeTruthy(); // duplicate student number
    expect((await bad({ rfidUid: "04A1B2C3" })).rfidUid).toBeTruthy(); // duplicate RFID
    // a half-filled address is refused by the server, with the field named (the form also blocks it before sending)
    const partial = await createAccountAction({}, studentForm(program.id, { email: "p@x.test", studentNumber: "2026-6666", rfidUid: "", regionCode: "050000000" }));
    expect(partial.error ?? Object.values(partial.fieldErrors ?? {}).join()).toMatch(/Complete the address|city|barangay/i);
    expect(await db.user.count({ where: { email: "p@x.test" } })).toBe(0);
  });

  it("staff and account-only accounts edit and save their own fields", async () => {
    const w = await makeWorld();
    const { college, dept } = await academic();
    await signInAs(w.admin.id);
    const staff = await createAccountAction({}, form({ accountType: "STAFF", firstName: "Ben", lastName: "Reyes", email: "ben@x.test", employeeId: "EMP-9", contactNumber: "", collegeId: "", departmentId: "", jobTitle: "" }));
    expect(staff.userId).toBeTruthy();
    const saved = await updateAccountAction({}, form({
      userId: staff.userId!, accountType: "STAFF", firstName: "Benjamin", lastName: "Reyes", middleName: "Q", email: "ben@x.test", employeeId: "EMP-10",
      contactNumber: "09171234567", collegeId: college.id, departmentId: dept.id, jobTitle: "Instructor",
    }));
    expect(saved.success).toBeTruthy();
    expect(userFormValues((await getUserForAdmin(staff.userId!))!)).toMatchObject({ firstName: "Benjamin", middleName: "Q", employeeId: "EMP-10", contactNumber: "09171234567", collegeId: college.id, departmentId: dept.id, jobTitle: "Instructor" });

    const plain = await createAccountAction({}, form({ accountType: "ACCOUNT_ONLY", firstName: "Cy", lastName: "Lim", email: "cy@x.test" }));
    expect((await updateAccountAction({}, form({ userId: plain.userId!, accountType: "ACCOUNT_ONLY", firstName: "Cyrus", lastName: "Lim", email: "cyrus@x.test" }))).success).toBeTruthy();
    expect(await db.user.findUniqueOrThrow({ where: { id: plain.userId! } })).toMatchObject({ firstName: "Cyrus", email: "cyrus@x.test" });
  });

  it("refuses non-administrators and ignores forged privilege fields", async () => {
    const w = await makeWorld();
    const { program } = await academic();
    await signInAs(w.admin.id);
    const id = (await createAccountAction({}, studentForm(program.id))).userId!;
    for (const who of [w.a.PRESIDENT.id, w.a.MEMBER.id, w.presidentB.id]) {
      await signInAs(who);
      await expect(createAccountAction({}, studentForm(program.id, { email: "z@x.test", studentNumber: "2026-9999" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateAccountAction({}, studentForm(program.id, { userId: id, firstName: "Hacked" }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.admin.id);
    await updateAccountAction({}, studentForm(program.id, { userId: id, systemRole: "SYSTEM_ADMIN", role: "PRESIDENT", status: "ACTIVE", passwordHash: "x" }));
    expect(await db.user.findUniqueOrThrow({ where: { id } })).toMatchObject({ systemRole: "USER", status: "INVITED", firstName: "Maria" });
    expect(await db.organizationMember.count({ where: { userId: id } })).toBe(0);
  });
});
