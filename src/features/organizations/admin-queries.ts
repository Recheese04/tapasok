import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { assertSystemPermission } from "@/lib/permissions";
import { PAGE_SIZE } from "@/components/shared/pagination";

// System Admin views of organizations. Each query re-checks the permission (defense in depth) and selects explicit fields.
// Member counts use active memberships only (ended memberships stay in history). A person holds at most one active
// membership per organization (unique index), so an organization's member count is also its unique-member count.

export type OrgScope = "DEPARTMENTAL" | "COLLEGE_WIDE" | "UNIVERSITY_WIDE" | "CO_CURRICULAR";
export type OrgFilters = { q?: string; status?: "ACTIVE" | "ARCHIVED"; scope?: OrgScope };

const activeStudent: Prisma.OrganizationMemberWhereInput = { endedAt: null, user: { studentProfile: { isNot: null } } };

export async function adminOrganizations(f: OrgFilters) {
  await assertSystemPermission("organizations.manage");
  const q = f.q?.trim().slice(0, 100);
  const where: Prisma.OrganizationWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.scope ? { scope: f.scope } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { acronym: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, totals] = await Promise.all([
    db.organization.findMany({
      where, orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, acronym: true, status: true, scope: true, autoEnroll: true,
        college: { select: { code: true } }, department: { select: { name: true } }, program: { select: { code: true } },
        _count: { select: { members: { where: { endedAt: null } } } },
        members: { where: { endedAt: null, role: "ADVISER" }, take: 1, select: { user: { select: { firstName: true, lastName: true } } } },
      },
    }),
    db.organization.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  // Students among the members, per organization, in one grouped query.
  const studentCounts = rows.length
    ? await db.organizationMember.groupBy({ by: ["organizationId"], where: { ...activeStudent, organizationId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
    : [];
  const students = new Map(studentCounts.map((s) => [s.organizationId, s._count._all]));
  return {
    rows: rows.map((r) => ({
      id: r.id, name: r.name, acronym: r.acronym, status: r.status, scope: r.scope, autoEnroll: r.autoEnroll,
      unit: r.program?.code ?? r.department?.name ?? r.college?.code ?? null,
      members: r._count.members, students: students.get(r.id) ?? 0,
      adviser: r.members[0] ? `${r.members[0].user.firstName} ${r.members[0].user.lastName}` : null,
    })),
    totals: { active: totals.find((t) => t.status === "ACTIVE")?._count._all ?? 0, archived: totals.find((t) => t.status === "ARCHIVED")?._count._all ?? 0 },
  };
}

/** Details for the View dialog: links, counts by position, activity. */
export async function adminOrganizationDetails(id: string) {
  await assertSystemPermission("organizations.manage");
  const org = await db.organization.findUnique({
    where: { id },
    select: {
      id: true, name: true, acronym: true, description: true, status: true, scope: true, autoEnroll: true, createdAt: true,
      collegeId: true, departmentId: true, programId: true,
      college: { select: { code: true, name: true } }, department: { select: { name: true } }, program: { select: { code: true, name: true } },
      _count: { select: { events: true, announcements: true, documents: true, devices: { where: { active: true } } } },
    },
  });
  if (!org) return null;
  const [byRole, students, officers] = await Promise.all([
    db.organizationMember.groupBy({ by: ["role"], where: { organizationId: id, endedAt: null }, _count: { _all: true } }),
    db.organizationMember.count({ where: { ...activeStudent, organizationId: id } }),
    db.organizationMember.findMany({
      where: { organizationId: id, endedAt: null, role: { not: "MEMBER" } }, orderBy: [{ role: "asc" }, { startedAt: "asc" }],
      select: { role: true, title: true, user: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  return {
    ...org,
    members: byRole.reduce((s, r) => s + r._count._all, 0), students,
    byRole: Object.fromEntries(byRole.map((r) => [r.role, r._count._all])) as Record<string, number>,
    officers: officers.map((o) => ({ role: o.role, title: o.title, name: `${o.user.firstName} ${o.user.lastName}` })),
  };
}

/** Members of one organization for the Members dialog (search + pagination). */
export async function adminOrganizationMembers(id: string, opts: { q?: string; page?: number } = {}) {
  await assertSystemPermission("organizations.manage");
  const q = opts.q?.trim().slice(0, 100);
  const page = opts.page ?? 1;
  const where: Prisma.OrganizationMemberWhereInput = {
    organizationId: id, endedAt: null,
    ...(q ? { user: { OR: [
      { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } }, { studentProfile: { studentNumber: { contains: q, mode: "insensitive" } } },
    ] } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.organizationMember.count({ where }),
    db.organizationMember.findMany({
      where, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      orderBy: [{ role: "asc" }, { user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      select: {
        id: true, role: true, title: true, source: true, startedAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true, status: true, studentProfile: { select: { studentNumber: true, yearLevel: true, program: { select: { code: true } } } } } },
      },
    }),
  ]);
  return { total, rows };
}
