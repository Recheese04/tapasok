// Adds the institution's colleges and programs to Academic Setup. Idempotent: existing rows are reused, nothing is
// changed or deleted. Usage: npm run db:seed-academic
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { applyAcademicData } from "./academic-data";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

applyAcademicData(db)
  .then((r) => {
    for (const c of r.colleges) console.log(`${c.status === "created" ? "added   " : "existing"} college: ${c.name}`);
    for (const p of r.programs) console.log(`${p.status === "created" ? "added   " : "existing"} program: ${p.name} [${p.code}] (${p.college})`);
    console.log(`Done: ${r.colleges.filter((c) => c.status === "created").length} colleges and ${r.programs.filter((p) => p.status === "created").length} programs added.`);
  })
  .finally(() => db.$disconnect());
