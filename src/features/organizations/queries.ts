import "server-only";
import type { OrganizationRole } from "@/generated/prisma/enums";
import { db } from "@/lib/database/client";
import { canOrg, isSystemAdmin } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/dal";

/** Organizations the user may see: all for system admins, otherwise only their own. */
export async function listVisibleOrganizations(user: AuthUser) {
  const where = isSystemAdmin(user)
    ? {}
    : { members: { some: { userId: user.id, endedAt: null } } };

  return db.organization.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      acronym: true,
      status: true,
      _count: { select: { members: { where: { endedAt: null } } } },
    },
  });
}

export type RosterFilter = { q?: string; yearLevel?: number | "none"; accountStatus?: "ACTIVE" | "INVITED" | "DISABLED"; role?: OrganizationRole };

/**
 * Organization visible to the viewer, or null when it does not exist or they have no access (callers cannot tell the two
 * apart). Roster detail depends on the role: full (names + emails) for system admins, presidents and advisers; basic
 * (names + student numbers) for officers and treasurers; none for ordinary members. Roster filters (search, year level,
 * student status, position) run in the database; `memberCount` is always the whole roster.
 */
export async function getOrganizationForViewer(user: AuthUser, id: string, filter: RosterFilter = {}) {
  const admin = isSystemAdmin(user);
  if (!admin && !canOrg(user, "org.view", id)) return null;
  const level: "full" | "basic" | "none" = admin || canOrg(user, "members.roster", id) ? "full" : canOrg(user, "members.basic", id) ? "basic" : "none";

  const org = await db.organization.findUnique({ where: { id } });
  if (!org) return null;

  const q = (filter.q ?? "").trim().slice(0, 100);
  const userWhere = {
    ...(filter.accountStatus ? { status: filter.accountStatus } : {}),
    ...(filter.yearLevel === "none" ? { OR: [{ studentProfile: null }, { studentProfile: { yearLevel: null } }] } : filter.yearLevel ? { studentProfile: { yearLevel: filter.yearLevel } } : {}),
    ...(q ? { AND: [{ OR: [
      { firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } },
      { studentProfile: { studentNumber: { contains: q, mode: "insensitive" as const } } },
      ...(level === "full" ? [{ email: { contains: q, mode: "insensitive" as const } }] : []),
    ] }] } : {}),
  };
  const [members, memberCount] = level === "none" ? [[], 0] : await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: id, endedAt: null, ...(filter.role ? { role: filter.role } : {}), user: userWhere },
      orderBy: [{ role: "asc" }, { startedAt: "asc" }],
      select: {
        id: true, role: true, title: true, startedAt: true,
        user: { select: { firstName: true, lastName: true, status: true, email: level === "full", studentProfile: { select: { studentNumber: true, yearLevel: true, course: true, program: { select: { code: true } } } } } },
      },
    }),
    db.organizationMember.count({ where: { organizationId: id, endedAt: null } }),
  ]);
  return { ...org, members, memberCount, rosterLevel: level, canViewRoster: level !== "none" };
}
