import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { getActiveTerm } from "@/features/academic/service";
import { notify } from "@/features/notifications/service";

// Manual join requests for interest-based (co-curricular) organizations. Approval creates a MEMBER
// membership only; nothing here can grant another role.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Organizations a student may ask to join: active, interest-based, and not already a member. */
export function joinableOrganizations(userId: string) {
  return db.organization.findMany({
    where: { status: "ACTIVE", scope: "CO_CURRICULAR", members: { none: { userId, endedAt: null } }, joinRequests: { none: { userId, status: "PENDING" } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, acronym: true, description: true },
  });
}

export function myRequests(userId: string) {
  return db.joinRequest.findMany({
    where: { userId }, orderBy: { createdAt: "desc" }, take: 30,
    select: { id: true, status: true, message: true, decisionNote: true, decidedAt: true, createdAt: true, organization: { select: { name: true } } },
  });
}

export function pendingRequests(organizationId: string) {
  return db.joinRequest.findMany({
    where: { organizationId, status: "PENDING" }, orderBy: { createdAt: "asc" },
    select: { id: true, message: true, createdAt: true, user: { select: { firstName: true, lastName: true, studentProfile: { select: { studentNumber: true } } } } },
  });
}

export async function submitJoinRequest(userId: string, organizationId: string, message: string | null): Promise<Result> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { status: true, scope: true } });
  if (!org || org.status !== "ACTIVE" || org.scope !== "CO_CURRICULAR") return { ok: false, error: "This organization does not accept join requests." };
  const member = await db.organizationMember.findFirst({ where: { organizationId, userId, endedAt: null }, select: { id: true } });
  if (member) return { ok: false, error: "You are already a member of this organization." };
  try {
    await db.joinRequest.create({ data: { organizationId, userId, message } });
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "You already have a pending request for this organization." };
    throw e;
  }
  await db.auditLog.create({ data: { actorUserId: userId, action: "join_request.submit", targetType: "organization", targetId: organizationId } });
  return { ok: true };
}

export async function cancelJoinRequest(userId: string, requestId: string): Promise<Result> {
  const { count } = await db.joinRequest.updateMany({ where: { id: requestId, userId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
  return count ? { ok: true } : { ok: false, error: "Request not found or already decided." };
}

/** Approves or rejects a pending request (caller has verified review authority for the request's organization). */
export async function decideJoinRequest(reviewerId: string, requestId: string, approve: boolean, note: string | null): Promise<Result> {
  const term = await getActiveTerm();
  try {
    const outcome = await db.$transaction(async (tx) => {
      // Claim the pending row so two reviewers cannot both decide it.
      const claimed = await tx.joinRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status: approve ? "APPROVED" : "REJECTED", decidedById: reviewerId, decidedAt: new Date(), decisionNote: note },
      });
      if (claimed.count === 0) return { ok: false as const, error: "This request was already decided." };
      const req = await tx.joinRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (approve) {
        const org = await tx.organization.findUniqueOrThrow({ where: { id: req.organizationId }, select: { status: true } });
        if (org.status !== "ACTIVE") throw new Error("inactive");
        const existing = await tx.organizationMember.findFirst({ where: { organizationId: req.organizationId, userId: req.userId, endedAt: null }, select: { id: true } });
        if (!existing) {
          await tx.organizationMember.create({
            data: { organizationId: req.organizationId, userId: req.userId, role: "MEMBER", source: "JOIN_REQUEST", semesterId: term?.semester.id ?? null },
          });
        }
      }
      await tx.auditLog.create({
        data: { actorUserId: reviewerId, action: approve ? "join_request.approve" : "join_request.reject", targetType: "organization", targetId: req.organizationId, metadata: { requestId, userId: req.userId } },
      });
      return { ok: true as const, userId: req.userId, organizationId: req.organizationId };
    });
    if (outcome.ok) {
      const org = await db.organization.findUnique({ where: { id: outcome.organizationId }, select: { name: true } });
      await notify([outcome.userId], { kind: "join_request", title: approve ? `Your request to join ${org?.name} was approved` : `Your request to join ${org?.name} was declined`, body: note ?? undefined, href: "/join" });
      return { ok: true };
    }
    return outcome;
  } catch (e) {
    if (e instanceof Error && e.message === "inactive") return { ok: false, error: "This organization is not active." };
    throw e;
  }
}
