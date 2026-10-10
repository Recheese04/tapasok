import "server-only";
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

/**
 * Organization visible to the viewer, or null when it does not exist or they have no access
 * (callers cannot tell the two apart). Roster detail depends on the role:
 * full (names + emails) for system admins, presidents and advisers; basic (names + student
 * numbers) for officers and treasurers; none for ordinary members.
 */
export async function getOrganizationForViewer(user: AuthUser, id: string) {
  const admin = isSystemAdmin(user);
  if (!admin && !canOrg(user, "org.view", id)) return null;
  const level: "full" | "basic" | "none" = admin || canOrg(user, "members.roster", id) ? "full" : canOrg(user, "members.basic", id) ? "basic" : "none";

  const org = await db.organization.findUnique({ where: { id } });
  if (!org) return null;

  const members = level === "none"
    ? []
    : await db.organizationMember.findMany({
        where: { organizationId: id, endedAt: null },
        orderBy: [{ role: "asc" }, { startedAt: "asc" }],
        select: {
          id: true, role: true, title: true,
          user: { select: { firstName: true, lastName: true, email: level === "full", studentProfile: { select: { studentNumber: true } } } },
        },
      });
  return { ...org, members, rosterLevel: level, canViewRoster: level !== "none" };
}
