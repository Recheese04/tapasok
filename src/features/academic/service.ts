import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";

// Institutional academic structure. Entries are archived (active=false) so historical enrollments, memberships, events
// and other records keep valid references; an entry can be permanently deleted only when nothing refers to it.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const audit = (actorId: string, action: string, targetType: string, targetId: string) =>
  db.auditLog.create({ data: { actorUserId: actorId, action, targetType, targetId } });

export async function getActiveTerm() {
  const semester = await db.semester.findFirst({ where: { active: true }, include: { schoolYear: true } });
  return semester ? { semester, schoolYear: semester.schoolYear } : null;
}

export async function createSchoolYear(actorId: string, input: { label: string; startsOn: Date; endsOn: Date }): Promise<Result<{ id: string }>> {
  if (input.endsOn <= input.startsOn) return { ok: false, error: "The school year must end after it starts." };
  try {
    const sy = await db.schoolYear.create({ data: input });
    await audit(actorId, "school_year.create", "school_year", sy.id);
    return { ok: true, id: sy.id };
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "A school year with this label already exists." };
    throw e;
  }
}

export async function createSemester(
  actorId: string,
  input: { schoolYearId: string; name: string; sequence: number; startsOn: Date; endsOn: Date },
): Promise<Result<{ id: string }>> {
  const sy = await db.schoolYear.findUnique({ where: { id: input.schoolYearId } });
  if (!sy) return { ok: false, error: "School year not found." };
  if (input.endsOn <= input.startsOn) return { ok: false, error: "The semester must end after it starts." };
  if (input.startsOn < sy.startsOn || input.endsOn > sy.endsOn) return { ok: false, error: "Semester dates must fall inside the school year." };
  try {
    const sem = await db.semester.create({ data: input });
    await audit(actorId, "semester.create", "semester", sem.id);
    return { ok: true, id: sem.id };
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "This school year already has a semester with that number." };
    throw e;
  }
}

/** Makes a semester (and its school year) the one active term. Past terms stay untouched. */
export async function setActiveTerm(actorId: string, semesterId: string): Promise<Result> {
  const sem = await db.semester.findUnique({ where: { id: semesterId } });
  if (!sem) return { ok: false, error: "Semester not found." };
  await db.$transaction([
    db.semester.updateMany({ where: { active: true }, data: { active: false } }),
    db.schoolYear.updateMany({ where: { active: true }, data: { active: false } }),
    db.schoolYear.update({ where: { id: sem.schoolYearId }, data: { active: true } }),
    db.semester.update({ where: { id: semesterId }, data: { active: true } }),
    audit(actorId, "term.activate", "semester", semesterId),
  ]);
  return { ok: true };
}

export async function createCollege(actorId: string, input: { code: string; name: string }): Promise<Result<{ id: string }>> {
  try {
    const c = await db.college.create({ data: input });
    await audit(actorId, "college.create", "college", c.id);
    return { ok: true, id: c.id };
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "A college with this code or name already exists." };
    throw e;
  }
}

export async function createDepartment(actorId: string, input: { collegeId: string; code: string; name: string }): Promise<Result<{ id: string }>> {
  const college = await db.college.findUnique({ where: { id: input.collegeId } });
  if (!college?.active) return { ok: false, error: "Choose an active college." };
  try {
    const d = await db.department.create({ data: input });
    await audit(actorId, "department.create", "department", d.id);
    return { ok: true, id: d.id };
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "This college already has a department with that code or name." };
    throw e;
  }
}

export async function createProgram(actorId: string, input: { departmentId: string; code: string; name: string }): Promise<Result<{ id: string }>> {
  const dept = await db.department.findUnique({ where: { id: input.departmentId }, include: { college: true } });
  if (!dept?.active || !dept.college.active) return { ok: false, error: "Choose an active department." };
  try {
    const p = await db.program.create({ data: input });
    await audit(actorId, "program.create", "program", p.id);
    return { ok: true, id: p.id };
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "A program with this code, or this name in the department, already exists." };
    throw e;
  }
}

const models = { college: db.college, department: db.department, program: db.program } as const;

/** Archive or restore an academic unit. Existing records referencing it are unaffected. */
export async function setUnitActive(actorId: string, kind: keyof typeof models, id: string, active: boolean): Promise<Result> {
  const model = models[kind] as unknown as { update: (a: { where: { id: string }; data: { active: boolean } }) => Promise<unknown> };
  try {
    await model.update({ where: { id }, data: { active } });
  } catch {
    return { ok: false, error: "Not found." };
  }
  await audit(actorId, `${kind}.${active ? "restore" : "archive"}`, kind, id);
  return { ok: true };
}

/** Programs with their department and college, for validation and selects. */
export async function academicTree(includeArchived = false) {
  return db.college.findMany({
    where: includeArchived ? {} : { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true, code: true, name: true, active: true,
      departments: {
        where: includeArchived ? {} : { active: true }, orderBy: { name: "asc" },
        select: { id: true, code: true, name: true, active: true, programs: { where: includeArchived ? {} : { active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, active: true } } },
      },
    },
  });
}

export type AcademicTree = Awaited<ReturnType<typeof academicTree>>;

/** Resolves a program to its department and college (and validates it is active). */
export async function resolveProgram(programId: string) {
  const p = await db.program.findUnique({ where: { id: programId }, include: { department: { include: { college: true } } } });
  if (!p || !p.active || !p.department.active || !p.department.college.active) return null;
  return { programId: p.id, programName: p.name, departmentId: p.departmentId, collegeId: p.department.collegeId };
}

/** Records the student's program and year level for the active semester (history is kept per term). */
export async function recordEnrollment(userId: string, programId: string, yearLevel: number) {
  const term = await getActiveTerm();
  if (!term) return;
  await db.studentEnrollment.upsert({
    where: { userId_semesterId: { userId, semesterId: term.semester.id } },
    update: { programId, yearLevel },
    create: { userId, semesterId: term.semester.id, programId, yearLevel },
  });
}

// ---- Update and delete -------------------------------------------------------------------------------------------
// Editing never changes which records point at an entry (ids are stable). Deleting is only possible when nothing refers
// to the entry: every relation is ON DELETE RESTRICT, so the database itself refuses otherwise and we report "in use".

const isInUse = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";

export async function updateSchoolYear(actorId: string, id: string, input: { label: string; startsOn: Date; endsOn: Date }): Promise<Result> {
  if (input.endsOn <= input.startsOn) return { ok: false, error: "The school year must end after it starts." };
  const sy = await db.schoolYear.findUnique({ where: { id }, include: { semesters: true } });
  if (!sy) return { ok: false, error: "School year not found." };
  if (sy.semesters.some((s) => s.startsOn < input.startsOn || s.endsOn > input.endsOn)) return { ok: false, error: "A semester of this year would fall outside the new dates." };
  try {
    await db.schoolYear.update({ where: { id }, data: input });
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "A school year with this label already exists." };
    throw e;
  }
  await audit(actorId, "school_year.update", "school_year", id);
  return { ok: true };
}

export async function updateSemester(actorId: string, id: string, input: { name: string; sequence: number; startsOn: Date; endsOn: Date }): Promise<Result> {
  const sem = await db.semester.findUnique({ where: { id }, include: { schoolYear: true } });
  if (!sem) return { ok: false, error: "Semester not found." };
  if (input.endsOn <= input.startsOn) return { ok: false, error: "The semester must end after it starts." };
  if (input.startsOn < sem.schoolYear.startsOn || input.endsOn > sem.schoolYear.endsOn) return { ok: false, error: "Semester dates must fall inside the school year." };
  try {
    await db.semester.update({ where: { id }, data: input });
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "This school year already has a semester with that number." };
    throw e;
  }
  await audit(actorId, "semester.update", "semester", id);
  return { ok: true };
}

export async function updateUnit(actorId: string, kind: keyof typeof models, id: string, input: { code: string; name: string }): Promise<Result> {
  const model = models[kind] as unknown as { update: (a: { where: { id: string }; data: { code: string; name: string } }) => Promise<unknown> };
  try {
    await model.update({ where: { id }, data: input });
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "Another entry already uses that code or name." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { ok: false, error: "Not found." };
    throw e;
  }
  await audit(actorId, `${kind}.update`, kind, id);
  return { ok: true };
}

export async function deleteAcademicRecord(actorId: string, kind: "school_year" | "semester" | "college" | "department" | "program", id: string): Promise<Result> {
  try {
    if (kind === "semester") {
      const s = await db.semester.findUnique({ where: { id }, select: { active: true } });
      if (!s) return { ok: false, error: "Not found." };
      if (s.active) return { ok: false, error: "The active semester cannot be deleted. Activate another term first." };
      await db.semester.delete({ where: { id } });
    } else if (kind === "school_year") {
      const y = await db.schoolYear.findUnique({ where: { id }, select: { active: true } });
      if (!y) return { ok: false, error: "Not found." };
      if (y.active) return { ok: false, error: "The active school year cannot be deleted." };
      await db.schoolYear.delete({ where: { id } });
    } else if (kind === "college") await db.college.delete({ where: { id } });
    else if (kind === "department") await db.department.delete({ where: { id } });
    else await db.program.delete({ where: { id } });
  } catch (e) {
    if (isInUse(e)) return { ok: false, error: "This entry is still used by other records (for example departments, members, events or fees). Archive it instead." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { ok: false, error: "Not found." };
    throw e;
  }
  await audit(actorId, `${kind}.delete`, kind, id);
  return { ok: true };
}
