// Colleges and degree programs of the institution, applied to Academic Setup.
//
// Safe to re-run: every college and program is looked up first (by name, ignoring case) and only created when missing;
// existing rows are never changed or removed.
//
// The database requires a unique code for every college and program, and a program must belong to a department. The
// institution's official codes and department structure were not provided, so this file does NOT guess them:
//   - college codes are the initials of the college name (for example "College of Teacher Education" -> CTE);
//   - program codes are "<college code>-P<n>", clearly provisional;
//   - each college gets one department named "General" that holds its programs.
// Rename any of these later under Academic Setup (the Edit buttons) once the official codes are known. Student records
// refer to programs by id, so editing a code or name never breaks existing students.
import type { PrismaClient } from "../src/generated/prisma/client";

export type CollegeSeed = { name: string; code: string; programs: string[] };

export const COLLEGES: CollegeSeed[] = [
  {
    name: "College of Fisheries and Marine Sciences",
    code: "CFMS",
    programs: ["Bachelor of Science in Fisheries", "Bachelor of Science in Marine Biology"],
  },
  {
    name: "College of Teacher Education",
    code: "CTE",
    programs: [
      "Bachelor of Elementary Education",
      "Bachelor of Secondary Education major in English",
      "Bachelor of Secondary Education major in Filipino",
      "Bachelor of Secondary Education major in Science",
      "Bachelor of Secondary Education major in Mathematics",
    ],
  },
  {
    name: "College of Business Management",
    code: "CBM",
    programs: ["Bachelor of Science in Office Administration", "Bachelor of Science in Hospitality Management"],
  },
  {
    name: "College of Sciences",
    code: "CS",
    programs: ["Bachelor of Science in Computer Science", "Bachelor of Science in Environmental Science"],
  },
];

const DEPARTMENT = { code: "GEN", name: "General" };

export type AcademicResult = {
  colleges: { name: string; status: "created" | "existing" }[];
  programs: { college: string; name: string; code: string; status: "created" | "existing" }[];
};

/** Idempotent. Runs in one transaction, so a failure leaves nothing half-applied. */
export async function applyAcademicData(db: PrismaClient, data: CollegeSeed[] = COLLEGES): Promise<AcademicResult> {
  return db.$transaction(async (tx) => {
    const result: AcademicResult = { colleges: [], programs: [] };

    for (const c of data) {
      let college = await tx.college.findFirst({ where: { name: { equals: c.name, mode: "insensitive" } } });
      if (!college) {
        // The code must be free; if another college already uses it, fall back to a numbered variant instead of failing.
        let code = c.code;
        for (let n = 2; await tx.college.findUnique({ where: { code } }); n++) code = `${c.code}-${n}`;
        college = await tx.college.create({ data: { code, name: c.name } });
        await tx.auditLog.create({ data: { action: "college.create", targetType: "college", targetId: college.id, metadata: { source: "academic-data" } } });
        result.colleges.push({ name: c.name, status: "created" });
      } else {
        result.colleges.push({ name: c.name, status: "existing" });
      }

      // Reuse the college's existing "General" department if there is one; otherwise create it.
      let dept = await tx.department.findFirst({ where: { collegeId: college.id, name: { equals: DEPARTMENT.name, mode: "insensitive" } } });
      const hasPrograms = c.programs.length > 0;
      if (!dept && hasPrograms) {
        dept = await tx.department.create({ data: { collegeId: college.id, ...DEPARTMENT } });
        await tx.auditLog.create({ data: { action: "department.create", targetType: "department", targetId: dept.id, metadata: { source: "academic-data" } } });
      }

      for (const [i, name] of c.programs.entries()) {
        // A program that already exists anywhere under this college is reused as is.
        const existing = await tx.program.findFirst({ where: { name: { equals: name, mode: "insensitive" }, department: { collegeId: college.id } } });
        if (existing) {
          result.programs.push({ college: c.name, name, code: existing.code, status: "existing" });
          continue;
        }
        let code = `${c.code}-P${i + 1}`;
        for (let n = 2; await tx.program.findUnique({ where: { code } }); n++) code = `${c.code}-P${i + 1}-${n}`;
        const p = await tx.program.create({ data: { departmentId: dept!.id, code, name } });
        await tx.auditLog.create({ data: { action: "program.create", targetType: "program", targetId: p.id, metadata: { source: "academic-data" } } });
        result.programs.push({ college: c.name, name, code, status: "created" });
      }
    }
    return result;
  }, { maxWait: 20_000, timeout: 120_000 }); // generous: a hosted database far away makes each query slow
}
