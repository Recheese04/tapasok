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

/**
 * Pending requests with what a reviewer needs to decide: the student's academic details and how often they asked before.
 * Contact details beyond the school email, addresses and photos are not included.
 */
export async function pendingRequests(organizationId: string) {
  const rows = await db.joinRequest.findMany({
    where: { organizationId, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 200,
    select: {
      id: true, message: true, createdAt: true, userId: true,
      user: {
        select: {
          firstName: true, lastName: true, email: true,
          studentProfile: { select: { studentNumber: true, yearLevel: true, course: true, college: true, program: { select: { code: true, name: true, department: { select: { name: true, college: { select: { code: true } } } } } } } },
        },
      },
    },
  });
  const earlier = rows.length
    ? await db.joinRequest.groupBy({ by: ["userId"], where: { organizationId, userId: { in: rows.map((r) => r.userId) }, status: "REJECTED" }, _count: { _all: true } })
    : [];
  const rejectedBefore = new Map(earlier.map((e) => [e.userId, e._count._all]));
  return rows.map((r) => {
    const sp = r.user.studentProfile;
    return {
      id: r.id, message: r.message, createdAt: r.createdAt, userId: r.userId,
      name: `${r.user.firstName} ${r.user.lastName}`, email: r.user.email,
      studentNumber: sp?.studentNumber ?? null, yearLevel: sp?.yearLevel ?? null,
      program: sp?.program ? `${sp.program.code} · ${sp.program.name}` : (sp?.course ?? null),
      college: sp?.program?.department.college.code ?? sp?.college ?? null,
      department: sp?.program?.department.name ?? null,
      rejectedBefore: rejectedBefore.get(r.userId) ?? 0,
    };
  });
}
export type PendingRequest = Awaited<ReturnType<typeof pendingRequests>>[number];

/** The latest decisions in the organization, with who made them (kept for the reviewers' reference). */
export async function recentDecisions(organizationId: string, take = 10) {
  const rows = await db.joinRequest.findMany({
    where: { organizationId, status: { in: ["APPROVED", "REJECTED"] } }, orderBy: { decidedAt: "desc" }, take,
    select: { id: true, status: true, decidedAt: true, decisionNote: true, user: { select: { firstName: true, lastName: true } }, decidedBy: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((r) => ({
    id: r.id, status: r.status as "APPROVED" | "REJECTED", decidedAt: r.decidedAt, note: r.decisionNote,
    name: `${r.user.firstName} ${r.user.lastName}`, decidedBy: r.decidedBy ? `${r.decidedBy.firstName} ${r.decidedBy.lastName}` : null,
  }));
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
  // The organization's reviewers (Secretary and President) are told there is a request waiting for them.
  const [student, org2, reviewers] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.organizationMember.findMany({ where: { organizationId, endedAt: null, role: { in: ["SECRETARY", "PRESIDENT"] }, user: { status: { not: "DISABLED" } } }, select: { userId: true } }),
  ]);
  if (reviewers.length) {
    await notify([...new Set(reviewers.map((r) => r.userId))], {
      kind: "join_request", title: `${student?.firstName ?? "A student"} ${student?.lastName ?? ""} asked to join ${org2?.name ?? "your organization"}`.replace(/\s+/g, " "),
      body: message ?? "Accept or reject the request.", href: `/organizations/${organizationId}`,
    });
  }
  return { ok: true };
}

export async function cancelJoinRequest(userId: string, requestId: string): Promise<Result> {
  const { count } = await db.joinRequest.updateMany({ where: { id: requestId, userId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
  return count ? { ok: true } : { ok: false, error: "Request not found or already decided." };
}

/** Approves or rejects a pending request (caller has verified review authority for the request's organization). */
export async function decideJoinRequest(reviewerId: string, requestId: string, approve: boolean, note: string | null): Promise<Result> {
  // Nobody decides on their own request, whatever position they hold.
  const own = await db.joinRequest.findFirst({ where: { id: requestId, userId: reviewerId }, select: { id: true } });
  if (own) return { ok: false, error: "You cannot decide on your own request." };
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
