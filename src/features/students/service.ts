import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { makeUnusableHash } from "@/lib/auth/unusable";
import { parseCsv } from "@/lib/csv";
import { validateAddress, type ValidAddress } from "@/lib/psgc";
import { studentFieldsSchema, type StudentFields } from "@/lib/validation/students";
import { staffFieldsSchema } from "@/lib/validation/staff";
import { createStaff } from "@/features/users/staff";
import { newActivationToken, setupPath } from "@/features/auth/activation";
import { recordEnrollment, resolveProgram } from "@/features/academic/service";
import { applyAutoMappingForUser } from "@/features/organizations/mapping";
import { checkImportHeader, csvMessage, IMPORT_SPEC, ignoredColumns } from "./import-spec";

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";


const addressData = (a: ValidAddress | null) =>
  a
    ? { regionCode: a.regionCode, regionName: a.regionName, provinceCode: a.provinceCode, provinceName: a.provinceName,
        cityCode: a.cityCode, cityName: a.cityName, barangayCode: a.barangayCode, barangayName: a.barangayName }
    : { regionCode: null, regionName: null, provinceCode: null, provinceName: null,
        cityCode: null, cityName: null, barangayCode: null, barangayName: null };

type Result<T = object> = ({ ok: true } & T) | { ok: false; error?: string; fieldErrors?: Record<string, string> };

const DUPLICATE: Record<string, string> = {
  student_number: "A student with this student number already exists.",
  email: "An account with this email already exists.",
  rfid: "This RFID card is already assigned to another student.",
};

async function findDuplicate(fields: Pick<StudentFields, "studentNumber" | "email" | "rfidUid">): Promise<Record<string, string> | null> {
  const [byNumber, byEmail, byRfid] = await Promise.all([
    db.studentProfile.findUnique({ where: { studentNumber: fields.studentNumber }, select: { id: true } }),
    db.user.findUnique({ where: { email: fields.email }, select: { id: true } }),
    fields.rfidUid ? db.studentProfile.findUnique({ where: { rfidUid: fields.rfidUid }, select: { id: true } }) : null,
  ]);
  if (byNumber) return { studentNumber: DUPLICATE.student_number };
  if (byEmail) return { email: DUPLICATE.email };
  if (byRfid) return { rfidUid: DUPLICATE.rfid };
  return null;
}

/** Program + year level go together; the program must exist, be active, and belong to the configured structure. */
async function checkPlacement(fields: { programId?: string | null; yearLevel?: number | null }): Promise<Record<string, string> | null> {
  if (!fields.programId) return fields.yearLevel ? { programId: "Choose a program for the year level." } : null;
  if (!fields.yearLevel) return { yearLevel: "Year level is required with a program." };
  return (await resolveProgram(fields.programId)) ? null : { programId: "Choose an active program from the academic setup." };
}

async function afterPlacementChange(userId: string, fields: { programId?: string | null; yearLevel?: number | null }) {
  if (fields.programId && fields.yearLevel) await recordEnrollment(userId, fields.programId, fields.yearLevel);
  await applyAutoMappingForUser(userId);
}

/** Creates a login-less (INVITED) account plus its student profile. Never assigns any role. */
export async function createStudent(
  actorId: string,
  fields: StudentFields,
  address: ValidAddress | null,
  unusableHash?: string,
): Promise<Result<{ userId: string; setupPath: string }>> {
  const dup = (await findDuplicate(fields)) ?? (await checkPlacement(fields));
  if (dup) return { ok: false, fieldErrors: dup };

  const hash = unusableHash ?? (await makeUnusableHash());
  const t = newActivationToken();
  try {
    const user = await db.user.create({
      data: {
        email: fields.email,
        passwordHash: hash,
        firstName: fields.firstName,
        lastName: fields.lastName,
        status: "INVITED",
        // systemRole defaults to USER; no membership or role is ever created here.
        studentProfile: {
          create: {
            studentNumber: fields.studentNumber,
            middleName: fields.middleName ?? null,
            programId: fields.programId ?? null,
            yearLevel: fields.yearLevel ?? null,
            rfidUid: fields.rfidUid ?? null,
            contactNumber: fields.contactNumber ?? null,
            streetAddress: fields.streetAddress ?? null,
            ...addressData(address),
          },
        },
        activationTokens: { create: { tokenHash: t.tokenHash, expiresAt: t.expiresAt, createdById: actorId } },
      },
    });
    await db.auditLog.create({
      data: { actorUserId: actorId, action: "student.create", targetType: "user", targetId: user.id },
    });
    await afterPlacementChange(user.id, fields);
    return { ok: true, userId: user.id, setupPath: setupPath(t.token) };
  } catch (e) {
    if (isUnique(e)) return { ok: false, fieldErrors: (await findDuplicate(fields)) ?? { email: DUPLICATE.email } };
    throw e;
  }
}

export async function updateStudent(
  actorId: string,
  userId: string,
  fields: Omit<StudentFields, "email">,
  address: ValidAddress | null,
): Promise<Result> {
  const profile = await db.studentProfile.findUnique({ where: { userId } });
  if (!profile) return { ok: false, error: "Student not found." };
  const bad = await checkPlacement(fields);
  if (bad) return { ok: false, fieldErrors: bad };
  if (fields.rfidUid && fields.rfidUid !== profile.rfidUid) {
    const taken = await db.studentProfile.findUnique({ where: { rfidUid: fields.rfidUid }, select: { userId: true } });
    if (taken && taken.userId !== userId) return { ok: false, fieldErrors: { rfidUid: DUPLICATE.rfid } };
  }

  try {
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { firstName: fields.firstName, lastName: fields.lastName } }),
      db.studentProfile.update({
        where: { userId },
        data: {
          studentNumber: fields.studentNumber,
          middleName: fields.middleName ?? null,
          programId: fields.programId ?? null,
          yearLevel: fields.yearLevel ?? null,
          rfidUid: fields.rfidUid ?? null,
          contactNumber: fields.contactNumber ?? null,
          streetAddress: fields.streetAddress ?? null,
          ...addressData(address),
        },
      }),
      db.auditLog.create({ data: { actorUserId: actorId, action: "student.update", targetType: "user", targetId: userId } }),
    ]);
    await afterPlacementChange(userId, fields);
    return { ok: true };
  } catch (e) {
    if (isUnique(e)) return { ok: false, fieldErrors: { studentNumber: DUPLICATE.student_number } };
    throw e;
  }
}

/** A student editing their own contact details and address. */
export async function updateOwnProfile(
  userId: string,
  fields: { middleName?: string | null; contactNumber?: string | null; streetAddress?: string | null },
  address: ValidAddress | null,
): Promise<Result> {
  const profile = await db.studentProfile.findUnique({ where: { userId } });
  if (!profile) return { ok: false, error: "No student profile is linked to your account." };
  await db.studentProfile.update({
    where: { userId },
    data: {
      middleName: fields.middleName ?? null,
      contactNumber: fields.contactNumber ?? null,
      streetAddress: fields.streetAddress ?? null,
      ...addressData(address),
    },
  });
  await db.auditLog.create({ data: { actorUserId: userId, action: "student.update_own", targetType: "user", targetId: userId } });
  return { ok: true };
}

// ---------------------------------------------------------------- CSV import

export const IMPORT_MAX_BYTES = 1_000_000;
export const IMPORT_MAX_ROWS = 2000;

export const IMPORT_COLUMNS = IMPORT_SPEC.map((c) => c.name);

export type ImportRowError = { row: number; studentNumber: string; message: string };
export type ImportPreviewRow = { row: number; type: string; id: string; name: string; email: string; ok: boolean };
export type ImportLink = { studentNumber: string; name: string; email: string; path: string };
export type ImportSummary = {
  dryRun: boolean;
  total: number;
  created: number;
  failed: number;
  errors: ImportRowError[];
  ignoredColumns: string[];
  links: ImportLink[]; // one-time setup links; only present for real imports
  preview: ImportPreviewRow[]; // the first rows with their result, so the file can be reviewed before confirming
};

export async function importStudents(actorId: string, csvText: string, dryRun: boolean): Promise<{ ok: true; summary: ImportSummary } | { ok: false; error: string }> {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return { ok: false, error: "The file is empty." };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const problems = checkImportHeader(rows[0]);
  if (problems.length) return { ok: false, error: problems.join(" ") };

  // Unknown columns (for example "role", "system_role" or "position") are ignored: an import can never set roles,
  // organization positions or privileges, and it can only create STUDENT or STAFF accounts.
  const ignoredCols = ignoredColumns(rows[0]);

  const data = rows.slice(1);
  if (data.length === 0) return { ok: false, error: "The file has a header but no student rows." };
  if (data.length > IMPORT_MAX_ROWS) return { ok: false, error: `Too many rows (${data.length}). The limit is ${IMPORT_MAX_ROWS} per file.` };

  const errors: ImportRowError[] = [];
  const links: ImportLink[] = [];
  const seenNumbers = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  const seenRfids = new Map<string, number>();
  const unusable = dryRun ? "" : await makeUnusableHash();
  const colleges = new Map((await db.college.findMany({ where: { active: true }, select: { id: true, code: true } })).map((c) => [c.code.toUpperCase(), c.id]));
  const departments = new Map((await db.department.findMany({ where: { active: true }, select: { id: true, code: true, collegeId: true } })).map((d) => [`${d.collegeId}:${d.code.toUpperCase()}`, d.id]));
  const seenEmployees = new Map<string, number>();
  const programs = new Map((await db.program.findMany({ where: { active: true, department: { active: true, college: { active: true } } }, select: { id: true, code: true } })).map((p) => [p.code.toUpperCase(), p.id]));
  let created = 0;

  for (let i = 0; i < data.length; i++) {
    const rowNo = i + 2; // spreadsheet row number (header is row 1)
    const cell = (name: string) => (data[i][header.indexOf(name)] ?? "").trim();
    const type = (cell("account_type") || "STUDENT").toUpperCase();
    const fail = (message: string) => errors.push({ row: rowNo, studentNumber: cell(type === "STAFF" ? "employee_id" : "student_number"), message: csvMessage(message) });

    if (data[i].length > header.length) { fail("Row has more values than the header has columns."); continue; }
    if (type !== "STUDENT" && type !== "STAFF") { fail(`account_type must be STUDENT or STAFF ("${type}" is not allowed). Imports never create administrators or assign positions.`); continue; }

    if (type === "STAFF") {
      const collegeCode = cell("college_code").toUpperCase();
      const deptCode = cell("department_code").toUpperCase();
      const collegeId = collegeCode ? colleges.get(collegeCode) ?? "unknown" : "";
      if (collegeCode && collegeId === "unknown") { fail(`college_code: "${collegeCode}" is not an active college.`); continue; }
      if (deptCode && !collegeCode) { fail("department_code needs a college_code."); continue; }
      const departmentId = deptCode ? departments.get(`${collegeId}:${deptCode}`) ?? "unknown" : "";
      if (deptCode && departmentId === "unknown") { fail(`department_code: "${deptCode}" is not an active department of that college.`); continue; }
      const sp = staffFieldsSchema.safeParse({
        employeeId: cell("employee_id"), firstName: cell("first_name"), lastName: cell("last_name"), middleName: cell("middle_name"), email: cell("email"),
        contactNumber: cell("contact_number"), collegeId, departmentId, jobTitle: cell("job_title"),
      });
      if (!sp.success) { fail(sp.error.issues.map((x) => `${x.path.join(".") || "row"}: ${x.message}`).join("; ")); continue; }
      const sf = sp.data;
      const key = sf.employeeId.toLowerCase();
      if (seenEmployees.has(key)) { fail(`Duplicate employee ID (also on row ${seenEmployees.get(key)}).`); continue; }
      if (seenEmails.has(sf.email)) { fail(`Duplicate email (also on row ${seenEmails.get(sf.email)}).`); continue; }
      seenEmployees.set(key, rowNo); seenEmails.set(sf.email, rowNo);
      if (await db.staffProfile.findUnique({ where: { employeeId: sf.employeeId }, select: { id: true } })) { fail("A staff member with this employee ID already exists. Existing records are never overwritten."); continue; }
      if (await db.user.findUnique({ where: { email: sf.email }, select: { id: true } })) { fail("An account with this email already exists. Existing records are never overwritten."); continue; }
      if (dryRun) { created++; continue; }
      const made = await createStaff(actorId, sf, unusable);
      if (!made.ok) { fail(Object.values(made.fieldErrors ?? {})[0] ?? made.error ?? "Could not create staff account."); continue; }
      created++;
      links.push({ studentNumber: sf.employeeId, name: `${sf.firstName} ${sf.lastName}`, email: sf.email, path: made.setupPath });
      continue;
    }
    if (!cell("student_number")) { fail("student_number: Student number is required for students."); continue; }

    const parsed = studentFieldsSchema.safeParse({
      studentNumber: cell("student_number"),
      firstName: cell("first_name"),
      lastName: cell("last_name"),
      email: cell("email"),
      middleName: cell("middle_name"),
      programId: "",
      yearLevel: cell("year_level"),
      rfidUid: cell("rfid_uid"),
      contactNumber: cell("contact_number"),
      streetAddress: cell("street_address"),
    });
    if (!parsed.success) {
      fail(parsed.error.issues.map((x) => `${x.path.join(".") || "row"}: ${x.message}`).join("; "));
      continue;
    }
    const f = parsed.data;
    const programCode = cell("program_code").toUpperCase();
    if (programCode) {
      const prog = programs.get(programCode);
      if (!prog) { fail(`program_code: "${programCode}" is not an active program in the academic setup.`); continue; }
      f.programId = prog;
    }
    const placement = await checkPlacement(f);
    if (placement) { fail(Object.values(placement)[0]); continue; }

    const key = f.studentNumber.toLowerCase();
    if (seenNumbers.has(key)) { fail(`Duplicate student number (also on row ${seenNumbers.get(key)}).`); continue; }
    if (seenEmails.has(f.email)) { fail(`Duplicate email (also on row ${seenEmails.get(f.email)}).`); continue; }
    seenNumbers.set(key, rowNo);
    seenEmails.set(f.email, rowNo);

    const dup = await findDuplicate(f);
    if (dup) { fail(`${Object.values(dup)[0]} Existing records are never overwritten.`); continue; }
    if (f.rfidUid) {
      if (seenRfids.has(f.rfidUid)) { fail(`Duplicate RFID UID (also on row ${seenRfids.get(f.rfidUid)}).`); continue; }
      seenRfids.set(f.rfidUid, rowNo);
    }

    const addr = await validateAddress({
      regionCode: cell("region_code") || undefined,
      provinceCode: cell("province_code") || undefined,
      cityCode: cell("city_code") || undefined,
      barangayCode: cell("barangay_code") || undefined,
    });
    if (!addr.ok) { fail(`Address: ${addr.error}`); continue; }

    if (dryRun) { created++; continue; }

    const res = await createStudent(actorId, f, addr.address, unusable);
    if (!res.ok) { fail(Object.values(res.fieldErrors ?? {})[0] ?? res.error ?? "Could not create student."); continue; }
    created++;
    links.push({ studentNumber: f.studentNumber, name: `${f.firstName} ${f.lastName}`, email: f.email, path: res.setupPath });
  }

  if (!dryRun) {
    await db.auditLog.create({
      data: { actorUserId: actorId, action: "account.import", metadata: { total: data.length, created, failed: errors.length } },
    });
  }
  const failedRows = new Set(errors.map((e) => e.row));
  const preview: ImportPreviewRow[] = data.slice(0, 100).map((r, i) => {
    const cell = (name: string) => (r[header.indexOf(name)] ?? "").trim();
    const type = (cell("account_type") || "STUDENT").toUpperCase();
    return { row: i + 2, type, id: cell(type === "STAFF" ? "employee_id" : "student_number"), name: `${cell("first_name")} ${cell("last_name")}`.trim(), email: cell("email"), ok: !failedRows.has(i + 2) };
  });
  return { ok: true, summary: { dryRun, total: data.length, created, failed: errors.length, errors, ignoredColumns: ignoredCols, links, preview } };
}
