import { db } from "@/lib/database/client";
import { authed, json } from "@/lib/mobile/api";

/** The member's own organizations and positions (headcount only, no member details). */
export const GET = authed(async (user) => {
  const orgs = await db.organization.findMany({
    where: { id: { in: user.memberships.map((m) => m.organizationId) } },
    select: { id: true, name: true, acronym: true, description: true, scope: true, _count: { select: { members: { where: { endedAt: null } } } } },
    orderBy: { name: "asc" },
  });
  return json({
    organizations: orgs.map((o) => ({
      id: o.id, name: o.name, acronym: o.acronym, description: o.description, scope: o.scope, memberCount: o._count.members,
      positions: user.memberships.filter((m) => m.organizationId === o.id).map((m) => ({ role: m.role, title: m.title })),
    })),
  });
});
