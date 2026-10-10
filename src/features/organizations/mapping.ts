import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { getActiveTerm } from "@/features/academic/service";

// Automatic academic mapping. It only ever applies when an organization is EXPLICITLY configured for it
// (autoEnroll) and has a departmental / college-wide / university-wide scope. Interest-based
// (co-curricular) organizations are never filled automatically, and the only role granted is MEMBER.

type OrgForMapping = { id: string; scope: "DEPARTMENTAL" | "COLLEGE_WIDE" | "UNIVERSITY_WIDE" | "CO_CURRICULAR"; collegeId: string | null; departmentId: string | null; programId: string | null };

function programFilter(org: OrgForMapping): Prisma.ProgramWhereInput | null {
  switch (org.scope) {
    case "DEPARTMENTAL":
      return org.departmentId ? { departmentId: org.departmentId, ...(org.programId ? { id: org.programId } : {}) } : null;
    case "COLLEGE_WIDE":
      return org.collegeId ? { department: { collegeId: org.collegeId } } : null;
    case "UNIVERSITY_WIDE":
      return {};
    default:
      return null;
  }
}

async function enroll(org: OrgForMapping, semesterId: string, onlyUserId?: string) {
  const filter = programFilter(org);
  if (!filter) return 0;
  const students = await db.user.findMany({
    where: {
      ...(onlyUserId ? { id: onlyUserId } : {}),
      status: { not: "DISABLED" },
      enrollments: { some: { semesterId, program: filter } },
      memberships: { none: { organizationId: org.id, endedAt: null } },
    },
    select: { id: true },
  });
  if (students.length === 0) return 0;
  const res = await db.organizationMember.createMany({
    data: students.map((s) => ({ organizationId: org.id, userId: s.id, role: "MEMBER" as const, source: "AUTO_MAPPING" as const, semesterId })),
    skipDuplicates: true,
  });
  return res.count;
}

/** Adds every currently enrolled student that matches the organization's configured academic unit. */
export async function syncOrganizationMembers(organizationId: string, actorId?: string): Promise<number> {
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  const term = await getActiveTerm();
  if (!org || !term || org.status !== "ACTIVE" || !org.autoEnroll) return 0;
  const added = await enroll(org, term.semester.id);
  if (added > 0) {
    await db.auditLog.create({ data: { actorUserId: actorId ?? null, action: "membership.auto_sync", targetType: "organization", targetId: organizationId, metadata: { added } } });
  }
  return added;
}

/** Called when a student's program or year level is saved. */
export async function applyAutoMappingForUser(userId: string): Promise<number> {
  const term = await getActiveTerm();
  if (!term) return 0;
  const orgs = await db.organization.findMany({ where: { status: "ACTIVE", autoEnroll: true, scope: { not: "CO_CURRICULAR" } } });
  let total = 0;
  for (const org of orgs) total += await enroll(org, term.semester.id, userId);
  return total;
}
