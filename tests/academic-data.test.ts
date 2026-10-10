import { describe, expect, it } from "vitest";
import { applyAcademicData, COLLEGES } from "../prisma/academic-data";
import { academicTree, resolveProgram } from "@/features/academic/service";
import { db } from "./helpers/db";

describe("institution colleges and programs", () => {
  it("adds every college and program under the right college, and is safe to re-run", async () => {
    const first = await applyAcademicData(db);
    expect(first.colleges.every((c) => c.status === "created")).toBe(true);
    expect(first.programs).toHaveLength(COLLEGES.reduce((n, c) => n + c.programs.length, 0));

    for (const c of COLLEGES) {
      const programs = await db.program.findMany({ where: { department: { college: { name: c.name } } }, select: { name: true, code: true } });
      expect(programs.map((p) => p.name).sort(), c.name).toEqual([...c.programs].sort());
    }
    // A program is never linked to another college.
    const bsme = await db.program.findFirstOrThrow({ where: { name: "Bachelor of Science in Marine Biology" }, include: { department: { include: { college: true } } } });
    expect(bsme.department.college.name).toBe("College of Fisheries and Marine Sciences");

    const counts = async () => [await db.college.count(), await db.department.count(), await db.program.count(), await db.auditLog.count()];
    const before = await counts();
    const second = await applyAcademicData(db);
    expect(second.colleges.every((c) => c.status === "existing")).toBe(true);
    expect(second.programs.every((p) => p.status === "existing")).toBe(true);
    expect(await counts()).toEqual(before);
  });

  it("reuses existing colleges and programs and never touches existing records", async () => {
    const existing = await db.college.create({ data: { code: "OLD-CTE", name: "college of teacher education" } }); // same name, different case/code
    const dept = await db.department.create({ data: { collegeId: existing.id, code: "EDU", name: "Education" } });
    const prog = await db.program.create({ data: { departmentId: dept.id, code: "BEED-OLD", name: "Bachelor of Elementary Education" } });
    const user = await db.user.create({ data: { email: "s@test.local", passwordHash: "x", firstName: "S", lastName: "T" } });
    await db.studentProfile.create({ data: { userId: user.id, studentNumber: "2024-1", programId: prog.id } });

    const res = await applyAcademicData(db);
    expect(res.colleges.find((c) => c.name === "College of Teacher Education")?.status).toBe("existing");
    expect(res.programs.find((p) => p.name === "Bachelor of Elementary Education")).toMatchObject({ status: "existing", code: "BEED-OLD" });
    expect(await db.college.count({ where: { name: { contains: "teacher education", mode: "insensitive" } } })).toBe(1);
    expect(await db.college.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ code: "OLD-CTE", name: "college of teacher education" });
    expect((await db.studentProfile.findUniqueOrThrow({ where: { userId: user.id } })).programId).toBe(prog.id);
    // The other four education programs were added next to it.
    expect(await db.program.count({ where: { department: { collegeId: existing.id } } })).toBe(5);
  });

  it("appears in the lists used by forms and resolves to the right college", async () => {
    await applyAcademicData(db);
    const tree = await academicTree();
    expect(tree.map((c) => c.name).sort()).toEqual(COLLEGES.map((c) => c.name).sort());
    const cs = tree.find((c) => c.name === "College of Sciences")!;
    const names = cs.departments.flatMap((d) => d.programs.map((p) => p.name)).sort();
    expect(names).toEqual(["Bachelor of Science in Computer Science", "Bachelor of Science in Environmental Science"]);
    const p = await db.program.findFirstOrThrow({ where: { name: "Bachelor of Science in Computer Science" } });
    const resolved = await resolveProgram(p.id);
    expect(resolved?.collegeId).toBe(cs.id);
  });
});
