// DEVELOPMENT / DEMO DATA ONLY. Refuses to run in production. Safe to re-run (upserts, never overwrites passwords).
// Creates clearly labelled demo data: an academic structure with an active term, one demo organization with an
// adviser and every officer position, and a few enrolled demo students.
// Usage: npm run db:seed   (optionally set SEED_PASSWORD; otherwise one is generated and printed)
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { OrganizationRole, SystemRole } from "../src/generated/prisma/enums";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const ORG_USERS: { email: string; firstName: string; role: OrganizationRole; title?: string }[] = [
  { email: "adviser@tapasok.test", firstName: "Adviser", role: "ADVISER" },
  { email: "president@tapasok.test", firstName: "President", role: "PRESIDENT" },
  { email: "secretary@tapasok.test", firstName: "Secretary", role: "SECRETARY" },
  { email: "treasurer@tapasok.test", firstName: "Treasurer", role: "TREASURER" },
  { email: "auditor@tapasok.test", firstName: "Auditor", role: "AUDITOR" },
  { email: "officer@tapasok.test", firstName: "Officer", role: "OFFICER", title: "Events officer" },
  { email: "member@tapasok.test", firstName: "Member", role: "MEMBER" },
];

async function main() {
  const generated = !process.env.SEED_PASSWORD;
  const password = process.env.SEED_PASSWORD ?? randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);
  const user = (email: string, firstName: string, systemRole: SystemRole = "USER") =>
    db.user.upsert({ where: { email }, update: {}, create: { email, passwordHash, firstName, lastName: "(Demo)", systemRole } });

  // Academic structure and the active term.
  const sy = await db.schoolYear.upsert({ where: { label: "2025-2026" }, update: {}, create: { label: "2025-2026", startsOn: new Date("2025-06-01Z"), endsOn: new Date("2026-05-31Z") } });
  const sem1 = await db.semester.upsert({ where: { schoolYearId_sequence: { schoolYearId: sy.id, sequence: 1 } }, update: {}, create: { schoolYearId: sy.id, name: "1st Semester", sequence: 1, startsOn: new Date("2025-06-01Z"), endsOn: new Date("2025-10-31Z") } });
  await db.semester.upsert({ where: { schoolYearId_sequence: { schoolYearId: sy.id, sequence: 2 } }, update: {}, create: { schoolYearId: sy.id, name: "2nd Semester", sequence: 2, startsOn: new Date("2025-11-01Z"), endsOn: new Date("2026-03-31Z") } });
  if (!(await db.semester.findFirst({ where: { active: true } }))) {
    await db.schoolYear.update({ where: { id: sy.id }, data: { active: true } });
    await db.semester.update({ where: { id: sem1.id }, data: { active: true } });
  }
  const college = await db.college.upsert({ where: { code: "DEMO-CAS" }, update: {}, create: { code: "DEMO-CAS", name: "[DEMO] College of Arts and Sciences" } });
  const dept = await db.department.upsert({ where: { collegeId_code: { collegeId: college.id, code: "CS" } }, update: {}, create: { collegeId: college.id, code: "CS", name: "[DEMO] Computer Studies" } });
  const program = await db.program.upsert({ where: { code: "DEMO-BSIT" }, update: {}, create: { departmentId: dept.id, code: "DEMO-BSIT", name: "[DEMO] BS Information Technology" } });

  // Demo organization (departmental, with automatic academic mapping).
  const org = await db.organization.upsert({
    where: { name: "[DEMO] Sample Organization" },
    update: {},
    create: { name: "[DEMO] Sample Organization", acronym: "DEMO", description: "Demo data for development only.", scope: "DEPARTMENTAL", collegeId: college.id, departmentId: dept.id, autoEnroll: false },
  });

  await user("admin@tapasok.test", "Admin", "SYSTEM_ADMIN");
  for (const u of ORG_USERS) {
    const row = await user(u.email, u.firstName);
    const active = await db.organizationMember.findFirst({ where: { organizationId: org.id, userId: row.id, endedAt: null } });
    if (!active) await db.organizationMember.create({ data: { organizationId: org.id, userId: row.id, role: u.role, title: u.title, source: "ADMIN", semesterId: sem1.id } });
    if (u.role !== "ADVISER") {
      await db.studentProfile.upsert({ where: { userId: row.id }, update: {}, create: { userId: row.id, studentNumber: `DEMO-${u.firstName.toUpperCase()}`, programId: program.id, yearLevel: 2 } });
      await db.studentEnrollment.upsert({ where: { userId_semesterId: { userId: row.id, semesterId: sem1.id } }, update: {}, create: { userId: row.id, semesterId: sem1.id, programId: program.id, yearLevel: 2 } });
    }
  }

  console.log(`Seeded demo data (*@tapasok.test) in "${org.name}" with an active term.`);
  console.log("Existing demo users keep their current password.");
  if (generated) console.log(`Password for newly created demo users: ${password}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
