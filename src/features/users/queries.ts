import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { assertSystemPermission } from "@/lib/permissions";
import { PAGE_SIZE } from "@/components/shared/pagination";
import type { AccountType } from "./types";

// Queries re-check authorization themselves (defense in depth) and select explicit fields, so password hashes, session
// tokens and lockout internals can never reach a page.

export type UserSort = "name" | "number" | "college" | "department" | "program" | "year" | "status" | "created";
export const USER_SORTS: readonly UserSort[] = ["name", "number", "college", "department", "program", "year", "status", "created"];

export type UserFilters = {
  q?: string;
  status?: "ACTIVE" | "INVITED" | "DISABLED";
  type?: AccountType | "ADMIN";
  privilege?: "SYSTEM_ADMIN" | "USER";
  organizationId?: string;
  role?: "PRESIDENT" | "SECRETARY" | "TREASURER" | "AUDITOR" | "OFFICER" | "ADVISER" | "MEMBER";
  // Academic placement. College and department match students (through their program) and faculty/staff (their own
  // college/department). Program and year level apply to students only. "none" = students with no program / no year level.
  collegeId?: string;
  departmentId?: string;
  programId?: string;
  yearLevel?: string;
  sort?: UserSort;
  dir?: "asc" | "desc";
};

export const UNASSIGNED = "none";

function whereFor(f: UserFilters): Prisma.UserWhereInput {
  const q = f.q?.trim().slice(0, 100);
  const and: Prisma.UserWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { studentProfile: { studentNumber: { contains: q, mode: "insensitive" } } },
        { studentProfile: { rfidUid: { contains: q, mode: "insensitive" } } },
        { staffProfile: { employeeId: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (f.status) and.push({ status: f.status });
  if (f.type === "STUDENT") and.push({ studentProfile: { isNot: null } });
  if (f.type === "STAFF") and.push({ staffProfile: { isNot: null } });
  if (f.type === "ACCOUNT_ONLY") and.push({ studentProfile: null, staffProfile: null });
  if (f.type === "ADMIN") and.push({ systemRole: "SYSTEM_ADMIN" });
  if (f.privilege) and.push({ systemRole: f.privilege });
  if (f.organizationId || f.role) {
    and.push({ memberships: { some: { endedAt: null, ...(f.organizationId ? { organizationId: f.organizationId } : {}), ...(f.role ? { role: f.role } : {}) } } });
  }
  if (f.programId === UNASSIGNED) and.push({ studentProfile: { programId: null } });
  else if (f.programId) and.push({ studentProfile: { programId: f.programId } });
  if (f.yearLevel === UNASSIGNED) and.push({ studentProfile: { yearLevel: null } });
  else if (f.yearLevel && /^\d{1,2}$/.test(f.yearLevel)) and.push({ studentProfile: { yearLevel: Number(f.yearLevel) } });
  if (f.departmentId) and.push({ OR: [{ studentProfile: { program: { departmentId: f.departmentId } } }, { staffProfile: { departmentId: f.departmentId } }] });
  else if (f.collegeId) and.push({ OR: [{ studentProfile: { program: { department: { collegeId: f.collegeId } } } }, { staffProfile: { collegeId: f.collegeId } }] });
  return and.length ? { AND: and } : {};
}

const rowSelect = {
  id: true, firstName: true, lastName: true, email: true, status: true, systemRole: true, createdAt: true,
  studentProfile: { select: { studentNumber: true, yearLevel: true, program: { select: { code: true, name: true, department: { select: { name: true, college: { select: { code: true, name: true } } } } } } } },
  staffProfile: { select: { employeeId: true, jobTitle: true, college: { select: { code: true, name: true } }, department: { select: { name: true } } } },
  memberships: { where: { endedAt: null }, orderBy: { startedAt: "asc" }, select: { id: true, role: true, title: true, organization: { select: { id: true, name: true } } } },
} as const satisfies Prisma.UserSelect;

const byName = (dir: "asc" | "desc"): Prisma.UserOrderByWithRelationInput[] => [{ lastName: dir }, { firstName: dir }, { email: "asc" }];

/**
 * Accounts for User Management: every filter, the search and the sort are applied on the server, then one page is returned.
 * Sorting by name, status or creation date is done by the database. Sorting by student/employee number, college,
 * department, program or year level reads only those sort values for the matching accounts, orders them so that accounts
 * WITHOUT a value (for example faculty when sorting by program) always come last in both directions, and then loads just
 * the rows of the requested page. Ties are broken by name.
 */
export async function listUsers(filters: UserFilters = {}, page = 1) {
  await assertSystemPermission("users.manage");
  const where = whereFor(filters);
  const sort = filters.sort ?? "name";
  const dir = filters.dir ?? "asc";
  const skip = (page - 1) * PAGE_SIZE;

  if (sort === "name" || sort === "status" || sort === "created") {
    const orderBy = sort === "name" ? byName(dir) : sort === "status" ? [{ status: dir }, ...byName("asc")] : [{ createdAt: dir }, { id: "asc" as const }];
    const [total, rows] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({ where, orderBy, skip, take: PAGE_SIZE, select: rowSelect }),
    ]);
    return { total, rows };
  }

  const keys = await db.user.findMany({
    where,
    select: {
      id: true, firstName: true, lastName: true,
      studentProfile: { select: { studentNumber: true, yearLevel: true, program: { select: { name: true, department: { select: { name: true, college: { select: { name: true } } } } } } } },
      staffProfile: { select: { employeeId: true, college: { select: { name: true } }, department: { select: { name: true } } } },
    },
  });
  const keyOf = (u: (typeof keys)[number]): string | number | null => {
    const sp = u.studentProfile, st = u.staffProfile;
    switch (sort) {
      case "number": return sp?.studentNumber ?? st?.employeeId ?? null;
      case "college": return sp?.program?.department.college.name ?? st?.college?.name ?? null;
      case "department": return sp?.program?.department.name ?? st?.department?.name ?? null;
      case "program": return sp?.program?.name ?? null;
      case "year": return sp?.yearLevel ?? null;
    }
  };
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  const name = (u: (typeof keys)[number]) => `${u.lastName}\u0000${u.firstName}`;
  const sign = dir === "asc" ? 1 : -1;
  const ordered = keys.map((u) => ({ u, k: keyOf(u) })).sort((a, b) => {
    if (a.k === null && b.k !== null) return 1; // missing values last, in both directions
    if (b.k === null && a.k !== null) return -1;
    if (a.k !== null && b.k !== null) {
      const c = typeof a.k === "number" && typeof b.k === "number" ? a.k - b.k : collator.compare(String(a.k), String(b.k));
      if (c !== 0) return c * sign;
    }
    return collator.compare(name(a.u), name(b.u)) || a.u.id.localeCompare(b.u.id);
  });
  const pageIds = ordered.slice(skip, skip + PAGE_SIZE).map((x) => x.u.id);
  const rows = await db.user.findMany({ where: { id: { in: pageIds } }, select: rowSelect });
  const at = new Map(pageIds.map((id, i) => [id, i]));
  rows.sort((a, b) => at.get(a.id)! - at.get(b.id)!);
  return { total: keys.length, rows };
}

/** Year levels that actually exist among students, per program ("none" for a missing year level), for the filter. */
export async function yearLevelsByProgram() {
  await assertSystemPermission("users.manage");
  const groups = await db.studentProfile.groupBy({ by: ["programId", "yearLevel"] });
  const out: Record<string, string[]> = {};
  const all = new Set<string>();
  for (const g of groups) {
    const y = g.yearLevel == null ? UNASSIGNED : String(g.yearLevel);
    const key = g.programId ?? UNASSIGNED;
    (out[key] ??= []).push(y);
    all.add(y);
  }
  const order = (ys: Iterable<string>) => [...new Set(ys)].sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : Number(a) - Number(b)));
  return { byProgram: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, order(v)])), all: order(all) };
}

/** Organizations for the filter and assignment dropdowns. */
export async function organizationOptions() {
  await assertSystemPermission("users.manage");
  return db.organization.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** Everything the admin account page needs. Never includes credentials, sessions or lockout state. */
export async function getUserForAdmin(id: string) {
  await assertSystemPermission("users.manage");
  return db.user.findUnique({
    where: { id },
    select: {
      id: true, firstName: true, lastName: true, email: true, status: true, systemRole: true, lastLoginAt: true, createdAt: true,
      studentProfile: {
        select: {
          studentNumber: true, middleName: true, programId: true, yearLevel: true, rfidUid: true, photoKey: true, contactNumber: true, streetAddress: true,
          regionCode: true, provinceCode: true, cityCode: true, barangayCode: true,
          program: { select: { name: true, department: { select: { id: true, collegeId: true } } } },
        },
      },
      staffProfile: { select: { employeeId: true, middleName: true, contactNumber: true, collegeId: true, departmentId: true, jobTitle: true } },
      memberships: {
        orderBy: [{ endedAt: { sort: "asc", nulls: "first" } }, { startedAt: "desc" }],
        select: { id: true, role: true, title: true, startedAt: true, endedAt: true, source: true, organization: { select: { id: true, name: true, status: true } } },
      },
    },
  });
}
