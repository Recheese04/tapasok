import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import type { FilterSelect } from "@/components/shared/filter-bar";
import { YEAR_LEVEL_OPTIONS } from "@/components/shared/filter-options";

// Filters shared by the finance pages (Fees & collections, Masterlist):
//   * school year (sy) and semester (sem): an assessment belongs to the term it was assessed in (student_fees.semester_id);
//     assessments with no term only show under "All school years".
//   * year level (yl): the student's current year level (1-6), or "none" for members without one on file.
// Values come from the URL and are validated here; anything invalid is ignored (= "all").

export type FinanceFilter = { sy: string | null; sem: string | null; yl: number | "none" | null };

const uuid = z.uuid();

export function parseFinanceFilter(sp: { sy?: string; sem?: string; yl?: string }): FinanceFilter {
  const yl = sp.yl === "none" ? "none" : /^[1-6]$/.test(sp.yl ?? "") ? Number(sp.yl) : null;
  return { sy: uuid.safeParse(sp.sy).success ? sp.sy! : null, sem: uuid.safeParse(sp.sem).success ? sp.sem! : null, yl };
}

/** Where-clause on student_fees for the chosen school year / semester. */
export function termWhere(f: FinanceFilter): Prisma.StudentFeeWhereInput {
  if (f.sem) return { semesterId: f.sem };
  if (f.sy) return { semester: { schoolYearId: f.sy } };
  return {};
}

/** Where-clause on users for the chosen year level. */
export function yearLevelWhere(f: FinanceFilter): Prisma.UserWhereInput {
  if (f.yl === "none") return { OR: [{ studentProfile: null }, { studentProfile: { yearLevel: null } }] };
  if (typeof f.yl === "number") return { studentProfile: { yearLevel: f.yl } };
  return {};
}

/** School years (newest first) with their semesters, for the filter menus. */
export async function termOptions() {
  const years = await db.schoolYear.findMany({
    orderBy: { startsOn: "desc" },
    select: { id: true, label: true, active: true, semesters: { orderBy: { sequence: "asc" }, select: { id: true, name: true, active: true } } },
  });
  return years;
}
export type TermOptions = Awaited<ReturnType<typeof termOptions>>;

/** Human label for the current filter, e.g. "2026-2027 · 1st Semester · Year 3". */
export function filterLabel(f: FinanceFilter, terms: TermOptions) {
  const parts: string[] = [];
  const year = f.sem ? terms.find((y) => y.semesters.some((s) => s.id === f.sem)) : terms.find((y) => y.id === f.sy);
  if (year) parts.push(year.label);
  const sem = year?.semesters.find((s) => s.id === f.sem);
  if (sem) parts.push(sem.name);
  if (f.yl === "none") parts.push("No year level");
  else if (typeof f.yl === "number") parts.push(`Year ${f.yl}`);
  return parts.join(" · ") || "All school years";
}

/** The filter as URL parameters (only the ones that are set). */
export const filterParams = (f: FinanceFilter): Record<string, string | undefined> => ({
  sy: f.sem ? undefined : (f.sy ?? undefined), sem: f.sem ?? undefined, yl: f.yl === null ? undefined : String(f.yl),
});

/**
 * School year, semester (and optionally year level) menus for the shared filter bar. The semester menu lists the chosen
 * school year's semesters; choosing another school year clears the semester.
 */
export function termSelects(terms: TermOptions, f: FinanceFilter, opts: { yearLevel?: boolean } = {}): FilterSelect[] {
  const year = f.sem ? terms.find((y) => y.semesters.some((s) => s.id === f.sem)) : terms.find((y) => y.id === f.sy);
  return [
    { key: "sy", label: "School year", all: "All school years", resets: ["sem"], options: terms.map((y) => [y.id, `${y.label}${y.active ? " (current)" : ""}`]) },
    { key: "sem", label: "Semester", all: "Whole school year", disabledText: "Choose a school year first", options: year ? year.semesters.map((s) => [s.id, `${s.name}${s.active ? " (current)" : ""}`]) : [] },
    ...(opts.yearLevel ? [{ key: "yl", label: "Year level", all: "All year levels", options: YEAR_LEVEL_OPTIONS }] : []),
  ];
}
