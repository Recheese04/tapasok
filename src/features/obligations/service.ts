import "server-only";
import { db } from "@/lib/database/client";
import { canOrg, type PolicyUser } from "@/lib/permissions/policy";
import { notify } from "@/features/notifications/service";

// Obligations are requirements assigned to members. They are their own records: an obligation is never created from an
// absence, and completing or missing one never creates a consequence. Any penalty is a separate, reviewed consequence.

type Actor = PolicyUser & { id: string };
type Fail = { ok: false; error: string };

export type ObligationInput = {
  organizationId: string; userIds: string[]; title: string; description: string | null;
  completionRequirements: string | null; dueAt: Date | null; eventId: string | null;
};

export async function createObligations(actor: Actor, input: ObligationInput): Promise<{ ok: true; count: number } | Fail> {
  if (!canOrg(actor, "obligations.manage", input.organizationId)) return { ok: false, error: "You cannot assign obligations in this organization." };
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return { ok: false, error: "Choose at least one member." };
  if (userIds.length > 500) return { ok: false, error: "Choose at most 500 members at a time." };

  // Only current members of THIS organization can be assigned.
  const members = await db.organizationMember.findMany({ where: { organizationId: input.organizationId, endedAt: null, userId: { in: userIds }, user: { status: "ACTIVE" } }, select: { userId: true } });
  const valid = new Set(members.map((m) => m.userId));
  if (valid.size !== userIds.length) return { ok: false, error: "Every selected person must be an active member of this organization." };

  if (input.eventId) {
    const ev = await db.event.findFirst({ where: { id: input.eventId, organizationId: input.organizationId }, select: { id: true } });
    if (!ev) return { ok: false, error: "That event does not belong to this organization." };
  }

  await db.$transaction([
    db.obligation.createMany({
      data: userIds.map((userId) => ({
        organizationId: input.organizationId, userId, eventId: input.eventId, title: input.title, description: input.description,
        completionRequirements: input.completionRequirements, dueAt: input.dueAt, createdById: actor.id,
      })),
    }),
    db.auditLog.create({ data: { actorUserId: actor.id, action: "obligation.create", targetType: "organization", targetId: input.organizationId, metadata: { title: input.title, count: userIds.length } } }),
  ]);
  await notify(userIds, { kind: "obligation", title: "New obligation assigned", body: input.title, href: "/obligations" });
  return { ok: true, count: userIds.length };
}

/** The assigned member reports progress or submits completion details. An officer still verifies completion. */
export async function submitObligation(userId: string, obligationId: string, note: string | null): Promise<{ ok: true } | Fail> {
  const o = await db.obligation.findFirst({ where: { id: obligationId, userId }, select: { id: true, status: true, organizationId: true, title: true } });
  if (!o) return { ok: false, error: "Obligation not found." };
  if (o.status === "COMPLETED" || o.status === "CANCELLED") return { ok: false, error: "This obligation is already closed." };
  await db.$transaction([
    db.obligation.update({ where: { id: o.id }, data: { status: "IN_PROGRESS", memberNote: note, submittedAt: new Date() } }),
    db.auditLog.create({ data: { actorUserId: userId, action: "obligation.submit", targetType: "obligation", targetId: o.id } }),
  ]);
  return { ok: true };
}

async function managed(actor: Actor, obligationId: string) {
  const o = await db.obligation.findUnique({ where: { id: obligationId }, select: { id: true, status: true, organizationId: true, userId: true, title: true } });
  if (!o || !canOrg(actor, "obligations.manage", o.organizationId)) return null; // same answer for missing and forbidden
  return o;
}

/** Verifies completion. Records who verified and when. Never creates or changes a consequence. */
export async function completeObligation(actor: Actor, obligationId: string, note: string | null): Promise<{ ok: true } | Fail> {
  const o = await managed(actor, obligationId);
  if (!o) return { ok: false, error: "Obligation not found." };
  if (o.status === "COMPLETED" || o.status === "CANCELLED") return { ok: false, error: "This obligation is already closed." };
  await db.$transaction([
    db.obligation.update({ where: { id: o.id }, data: { status: "COMPLETED", completedAt: new Date(), completedById: actor.id, completionNote: note } }),
    db.auditLog.create({ data: { actorUserId: actor.id, action: "obligation.complete", targetType: "obligation", targetId: o.id } }),
  ]);
  await notify([o.userId], { kind: "obligation", title: "Obligation completed", body: o.title, href: "/obligations" });
  return { ok: true };
}

export async function cancelObligation(actor: Actor, obligationId: string, note: string | null): Promise<{ ok: true } | Fail> {
  const o = await managed(actor, obligationId);
  if (!o) return { ok: false, error: "Obligation not found." };
  if (o.status === "COMPLETED" || o.status === "CANCELLED") return { ok: false, error: "This obligation is already closed." };
  await db.$transaction([
    db.obligation.update({ where: { id: o.id }, data: { status: "CANCELLED", completionNote: note } }),
    db.auditLog.create({ data: { actorUserId: actor.id, action: "obligation.cancel", targetType: "obligation", targetId: o.id } }),
  ]);
  return { ok: true };
}

/** Status shown to people: a pending or in-progress obligation past its due date reads as Overdue. */
export function displayStatus(o: { status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"; dueAt: Date | null }, now = new Date()) {
  if ((o.status === "PENDING" || o.status === "IN_PROGRESS") && o.dueAt && o.dueAt < now) return "OVERDUE" as const;
  return o.status;
}

/** Edits an open obligation's details. Status, submissions and verification history are not touched. */
export async function updateObligation(
  actor: Actor, obligationId: string,
  input: { title: string; description: string | null; completionRequirements: string | null; dueAt: Date | null },
): Promise<{ ok: true } | Fail> {
  const o = await managed(actor, obligationId);
  if (!o) return { ok: false, error: "Obligation not found." };
  if (o.status === "COMPLETED" || o.status === "CANCELLED") return { ok: false, error: "A closed obligation can no longer be edited." };
  await db.$transaction([
    db.obligation.update({ where: { id: o.id }, data: input }),
    db.auditLog.create({ data: { actorUserId: actor.id, action: "obligation.update", targetType: "obligation", targetId: o.id } }),
  ]);
  return { ok: true };
}
