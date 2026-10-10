import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { assertSystemPermission } from "@/lib/permissions";
import { PAGE_SIZE } from "@/components/shared/pagination";
import type { AccountType } from "./types";

// Queries re-check authorization themselves (defense in depth) and select explicit fields, so password hashes, session
// tokens and lockout internals can never reach a page.

export type UserFilters = {
  q?: string;
  status?: "ACTIVE" | "INVITED" | "DISABLED";
  type?: AccountType | "ADMIN";
  organizationId?: string;
  role?: "PRESIDENT" | "SECRETARY" | "TREASURER" | "AUDITOR" | "OFFICER" | "ADVISER" | "MEMBER";
};

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
  if (f.organizationId || f.role) {
    and.push({ memberships: { some: { endedAt: null, ...(f.organizationId ? { organizationId: f.organizationId } : {}), ...(f.role ? { role: f.role } : {}) } } });
  }
  return and.length ? { AND: and } : {};
}

export async function listUsers(filters: UserFilters = {}, page = 1) {
  await assertSystemPermission("users.manage");
  const where = whereFor(filters);
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, firstName: true, lastName: true, email: true, status: true, systemRole: true,
        studentProfile: { select: { studentNumber: true } },
        staffProfile: { select: { employeeId: true } },
        memberships: { where: { endedAt: null }, orderBy: { startedAt: "asc" }, select: { id: true, role: true, title: true, organization: { select: { id: true, name: true } } } },
      },
    }),
  ]);
  return { total, rows };
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
