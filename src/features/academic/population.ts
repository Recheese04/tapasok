import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { assertSystemPermission } from "@/lib/permissions";
import { PAGE_SIZE } from "@/components/shared/pagination";

// Student population for System Admin. Counts come from database aggregation (GROUP BY), never from loading every student.
//
// Who is a student: an account with a student profile. Faculty/staff, account-only users and administrators without a
// student profile are never counted.
//
// Where a student belongs:
//   * basis "current" (default): the student's current placement, student_profiles.program_id and .year_level. The program
//     gives the department and college through the academic structure (program -> department -> college).
//   * basis = a semester id: the placement recorded for that semester in student_enrollments (one row per student per
//     semester), so past terms can be compared. Students with no enrollment row in that semester are not part of it.
// A student without a program, or without a year level, is counted under "Unassigned"; nobody is silently left out.
// Every student is counted once, whatever their organization memberships: the counts come from profiles/enrollments,
// which have one row per student (per semester), not from memberships.

export const UNASSIGNED = "none";
export type Basis = "current" | string; // "current" or a semester id
export type StatusFilter = "active" | "all"; // "active" leaves out deactivated accounts

type Cell = { programId: string | null; yearLevel: number | null; count: number };

const userStatus = (status: StatusFilter): Prisma.UserWhereInput => (status === "active" ? { status: { not: "DISABLED" } } : {});

/** One aggregate row per (program, year level) for the chosen basis. */
async function cells(basis: Basis, status: StatusFilter): Promise<Cell[]> {
  if (basis === "current") {
    const rows = await db.studentProfile.groupBy({ by: ["programId", "yearLevel"], where: { user: userStatus(status) }, _count: { _all: true } });
    return rows.map((r) => ({ programId: r.programId, yearLevel: r.yearLevel, count: r._count._all }));
  }
  const rows = await db.studentEnrollment.groupBy({
    by: ["programId", "yearLevel"],
    where: { semesterId: basis, user: { studentProfile: { isNot: null }, ...userStatus(status) } },
    _count: { _all: true },
  });
  return rows.map((r) => ({ programId: r.programId, yearLevel: r.yearLevel, count: r._count._all }));
}

export type ProgramRow = {
  id: string; code: string; name: string; active: boolean;
  departmentId: string; departmentName: string; collegeId: string; collegeCode: string; collegeName: string;
  total: number; byYear: Record<string, number>; // year level ("1", "2", ... or "none") -> students
};

/** The whole breakdown: totals by college, department, program, year level, and program x year level. */
export async function studentPopulation(opts: { basis?: Basis; status?: StatusFilter } = {}) {
  await assertSystemPermission("reports.system");
  const basis = opts.basis ?? "current";
  const status = opts.status ?? "active";
  const [colleges, data, terms, activeTerm] = await Promise.all([
    db.college.findMany({
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, active: true, departments: { orderBy: { name: "asc" }, select: { id: true, code: true, name: true, active: true, programs: { orderBy: { name: "asc" }, select: { id: true, code: true, name: true, active: true } } } } },
    }),
    cells(basis, status),
    db.semester.findMany({ orderBy: [{ schoolYear: { startsOn: "desc" } }, { sequence: "desc" }], select: { id: true, name: true, active: true, schoolYear: { select: { label: true } } } }),
    db.semester.findFirst({ where: { active: true }, select: { id: true } }),
  ]);

  const programs: ProgramRow[] = [];
  for (const c of colleges) for (const d of c.departments) for (const p of d.programs) {
    programs.push({ id: p.id, code: p.code, name: p.name, active: p.active && d.active && c.active, departmentId: d.id, departmentName: d.name, collegeId: c.id, collegeCode: c.code, collegeName: c.name, total: 0, byYear: {} });
  }
  const byProgram = new Map(programs.map((p) => [p.id, p]));
  const unassignedProgram = { total: 0, byYear: {} as Record<string, number> };
  const byYear: Record<string, number> = {};
  let total = 0;
  for (const cell of data) {
    const y = cell.yearLevel == null ? UNASSIGNED : String(cell.yearLevel);
    const row = cell.programId ? byProgram.get(cell.programId) : undefined;
    const target = row ?? unassignedProgram; // a program id that no longer resolves is treated as unassigned too
    target.total += cell.count;
    target.byYear[y] = (target.byYear[y] ?? 0) + cell.count;
    byYear[y] = (byYear[y] ?? 0) + cell.count;
    total += cell.count;
  }

  const departments = colleges.flatMap((c) => c.departments.map((d) => ({
    id: d.id, code: d.code, name: d.name, active: d.active && c.active, collegeId: c.id, collegeCode: c.code, collegeName: c.name,
    programs: d.programs.length, total: programs.filter((p) => p.departmentId === d.id).reduce((s, p) => s + p.total, 0),
  })));
  const collegeRows = colleges.map((c) => ({
    id: c.id, code: c.code, name: c.name, active: c.active, departments: c.departments.length,
    programs: c.departments.reduce((s, d) => s + d.programs.length, 0),
    total: departments.filter((d) => d.collegeId === c.id).reduce((s, d) => s + d.total, 0),
  }));
  const yearLevels = Object.keys(byYear).filter((y) => y !== UNASSIGNED).map(Number).sort((a, b) => a - b).map(String);
  if (byYear[UNASSIGNED]) yearLevels.push(UNASSIGNED);

  return {
    basis, status, total, byYear, yearLevels,
    colleges: collegeRows, departments, programs, unassignedProgram,
    counts: { colleges: colleges.filter((c) => c.active).length, departments: departments.filter((d) => d.active).length, programs: programs.filter((p) => p.active).length },
    terms: terms.map((t) => ({ id: t.id, label: `${t.schoolYear.label} · ${t.name}`, active: t.active })),
    activeTermId: activeTerm?.id ?? null,
  };
}
export type Population = Awaited<ReturnType<typeof studentPopulation>>;

/** Unique students who belong to at least one organization, versus the number of memberships (one student can hold several). */
export async function membershipCounts(status: StatusFilter = "active") {
  await assertSystemPermission("reports.system");
  const where: Prisma.OrganizationMemberWhereInput = { endedAt: null, organization: { status: "ACTIVE" }, user: { studentProfile: { isNot: null }, ...userStatus(status) } };
  const [memberships, unique] = await Promise.all([
    db.organizationMember.count({ where }),
    db.organizationMember.groupBy({ by: ["userId"], where }).then((r) => r.length),
  ]);
  return { memberships, uniqueStudents: unique };
}

const programSelect = { code: true, name: true, department: { select: { name: true, college: { select: { code: true } } } } } as const;

export type GroupFilter = {
  basis?: Basis; status?: StatusFilter;
  collegeId?: string; departmentId?: string;
  programId?: string; // a program id, or "none" for students without a program
  yearLevel?: string; // "1", "2", ... or "none"
  q?: string;
};

/** Students in one group (program, year level, department or college), paginated, with search. */
export async function studentsInGroup(f: GroupFilter, page = 1) {
  await assertSystemPermission("reports.system");
  const basis = f.basis ?? "current";
  const year = f.yearLevel === UNASSIGNED ? null : f.yearLevel && /^\d{1,2}$/.test(f.yearLevel) ? Number(f.yearLevel) : undefined;
  const program: Prisma.ProgramWhereInput = {
    ...(f.departmentId ? { departmentId: f.departmentId } : {}),
    ...(f.collegeId ? { department: { collegeId: f.collegeId } } : {}),
  };
  const placement: Prisma.StudentProfileWhereInput = basis === "current"
    ? {
        ...(f.programId === UNASSIGNED ? { programId: null } : f.programId ? { programId: f.programId } : {}),
        ...(Object.keys(program).length && f.programId !== UNASSIGNED ? { program } : {}),
        ...(year !== undefined ? { yearLevel: year } : {}),
      }
    : {
        user: {
          enrollments: {
            some: {
              semesterId: basis,
              ...(f.programId && f.programId !== UNASSIGNED ? { programId: f.programId } : {}),
              ...(Object.keys(program).length ? { program } : {}),
              ...(year !== undefined && year !== null ? { yearLevel: year } : {}),
            },
          },
        },
      };
  const q = f.q?.trim().slice(0, 100);
  const where: Prisma.StudentProfileWhereInput = {
    AND: [
      placement,
      { user: userStatus(f.status ?? "active") },
      ...(q ? [{ OR: [
        { studentNumber: { contains: q, mode: "insensitive" as const } },
        { user: { firstName: { contains: q, mode: "insensitive" as const } } },
        { user: { lastName: { contains: q, mode: "insensitive" as const } } },
      ] }] : []),
    ],
  };
  const [total, rows] = await Promise.all([
    db.studentProfile.count({ where }),
    db.studentProfile.findMany({
      where, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }, { studentNumber: "asc" }],
      select: {
        studentNumber: true, yearLevel: true,
        user: { select: { id: true, firstName: true, lastName: true, status: true } },
        program: { select: programSelect },
      },
    }),
  ]);
  // For a past semester, show the placement recorded for that semester (one small query for this page of students).
  const terms = basis === "current" ? [] : await db.studentEnrollment.findMany({
    where: { semesterId: basis, userId: { in: rows.map((r) => r.user.id) } }, select: { userId: true, yearLevel: true, program: { select: programSelect } },
  });
  const termOf = new Map(terms.map((e) => [e.userId, e]));
  return {
    total,
    rows: rows.map((r) => {
      const e = termOf.get(r.user.id);
      const p = e ? e.program : r.program;
      return {
        userId: r.user.id, studentNumber: r.studentNumber, name: `${r.user.lastName}, ${r.user.firstName}`, status: r.user.status,
        program: p ? `${p.code} · ${p.name}` : null,
        unit: p ? `${p.department.college.code} · ${p.department.name}` : null,
        yearLevel: e ? e.yearLevel : r.yearLevel,
      };
    }),
  };
}
