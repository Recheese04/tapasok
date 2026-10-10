import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { OrganizationRole } from "@/generated/prisma/enums";
import { db } from "@/lib/database/client";
import { ADMIN_ONLY_ROLES } from "@/features/auth/roles";
import { getActiveTerm } from "@/features/academic/service";

// One place that creates organization memberships and positions for an existing account. A person has ONE account and can
// hold a different position in every organization; this never creates or changes accounts. President and Adviser are
// assignable only by a system admin (`canAssignPrivileged`).

type Result = { ok: true } | { ok: false; error: string };

export async function createMembership(opts: { actorId: string; canAssignPrivileged: boolean; organizationId: string; userId: string; role: OrganizationRole; title: string | null }): Promise<Result> {
  if (ADMIN_ONLY_ROLES.includes(opts.role) && !opts.canAssignPrivileged) return { ok: false, error: "Only a system admin can assign the president or adviser position." };

  const [org, target] = await Promise.all([
    db.organization.findUnique({ where: { id: opts.organizationId }, select: { status: true } }),
    db.user.findUnique({ where: { id: opts.userId }, select: { status: true } }),
  ]);
  if (!org || org.status !== "ACTIVE") return { ok: false, error: "This organization is not active." };
  if (!target || target.status === "DISABLED") return { ok: false, error: "That account is not active." };

  const term = await getActiveTerm();
  try {
    await db.organizationMember.create({
      data: { organizationId: opts.organizationId, userId: opts.userId, role: opts.role, title: opts.title, source: "ADMIN", semesterId: term?.semester.id ?? null },
    });
    await db.auditLog.create({
      data: { actorUserId: opts.actorId, action: "membership.add", targetType: "user", targetId: opts.userId, metadata: { organizationId: opts.organizationId, role: opts.role } },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "This person already has an active position in the organization, or the organization already has a president." };
    }
    throw e;
  }
  return { ok: true };
}

/** Ends a position without deleting it (history is kept). */
export async function endMembershipById(opts: { actorId: string; canAssignPrivileged: boolean; organizationId: string; membershipId: string }): Promise<Result> {
  const m = await db.organizationMember.findFirst({ where: { id: opts.membershipId, organizationId: opts.organizationId, endedAt: null } });
  if (!m) return { ok: false, error: "That membership was not found." };
  if (ADMIN_ONLY_ROLES.includes(m.role) && !opts.canAssignPrivileged) return { ok: false, error: "Only a system admin can remove a president or adviser." };
  await db.organizationMember.update({ where: { id: m.id }, data: { endedAt: new Date() } });
  await db.auditLog.create({ data: { actorUserId: opts.actorId, action: "membership.end", targetType: "user", targetId: m.userId, metadata: { organizationId: opts.organizationId, role: m.role } } });
  return { ok: true };
}
