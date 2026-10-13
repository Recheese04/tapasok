import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { getActiveTerm } from "@/features/academic/service";

// Joining an interest-based (co-curricular) organization. A student joins immediately, with no approval step, and always as
// a plain MEMBER: nothing here can grant any other position.
//
// Join requests from before approvals were removed are kept as history and are never deleted. A request that was still
// pending is closed as APPROVED ("Joined directly") when the student joins; until then it stays pending and visible to the
// student only, with a Join button.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Organizations a student may join: active, interest-based, and not already a member. */
export function joinableOrganizations(userId: string) {
  return db.organization.findMany({
    where: { status: "ACTIVE", scope: "CO_CURRICULAR", members: { none: { userId, endedAt: null } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, acronym: true, description: true, _count: { select: { members: { where: { endedAt: null } } } } },
  });
}

/** The student's join requests from before approvals were removed (history). */
export function myRequests(userId: string) {
  return db.joinRequest.findMany({
    where: { userId }, orderBy: { createdAt: "desc" }, take: 30,
    select: { id: true, status: true, message: true, decisionNote: true, decidedAt: true, createdAt: true, organizationId: true, organization: { select: { name: true } } },
  });
}

/**
 * Joins the organization right away as a MEMBER. The server checks the account, the organization (active, interest-based)
 * and that the person is not already an active member; the database also refuses a second active membership, so a double
 * click or two devices at once cannot create two.
 */
export async function joinOrganization(userId: string, organizationId: string): Promise<Result<{ organization: string }>> {
  const [org, user] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, status: true, scope: true } }),
    db.user.findUnique({ where: { id: userId }, select: { status: true, systemRole: true } }),
  ]);
  if (!user || user.status === "DISABLED") return { ok: false, error: "Your account is not active." };
  if (user.systemRole === "SYSTEM_ADMIN") return { ok: false, error: "System administrators manage organizations instead of joining them." };
  if (!org || org.status !== "ACTIVE" || org.scope !== "CO_CURRICULAR") return { ok: false, error: "This organization cannot be joined directly." };
  const term = await getActiveTerm();
  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.organizationMember.findFirst({ where: { organizationId, userId, endedAt: null }, select: { id: true } });
      if (existing) throw new AlreadyMember();
      await tx.organizationMember.create({ data: { organizationId, userId, role: "MEMBER", source: "JOIN_REQUEST", semesterId: term?.semester.id ?? null } });
      // An old pending request for this organization is closed with the outcome, not deleted.
      await tx.joinRequest.updateMany({ where: { organizationId, userId, status: "PENDING" }, data: { status: "APPROVED", decidedAt: new Date(), decisionNote: "Joined directly" } });
      await tx.auditLog.create({ data: { actorUserId: userId, action: "membership.join", targetType: "organization", targetId: organizationId, metadata: { role: "MEMBER" } } });
    });
  } catch (e) {
    if (e instanceof AlreadyMember || isUnique(e)) return { ok: false, error: "You are already a member of this organization." };
    throw e;
  }
  return { ok: true, organization: org.name };
}

class AlreadyMember extends Error {}

/** Withdraws one of the student's own old pending requests (history is kept as CANCELLED). */
export async function cancelJoinRequest(userId: string, requestId: string): Promise<Result> {
  const { count } = await db.joinRequest.updateMany({ where: { id: requestId, userId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
  return count ? { ok: true } : { ok: false, error: "Request not found or already closed." };
}
