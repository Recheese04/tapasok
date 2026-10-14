"use server";

import { z } from "zod";
import { db } from "@/lib/database/client";
import { Prisma } from "@/generated/prisma/client";
import { assertOrgPermission } from "@/lib/permissions";
import { parseAmount, adjustLedger } from "@/features/fees/service";
import { ledger } from "@/features/fees/ledger";
import { notify } from "@/features/notifications/service";
import { createManualConsequence } from "./auto";

export type ConsequenceState = { error?: string; success?: string };

const uuid = z.uuid();

// Rules are configured by consequences.rules (President and Secretary; the Adviser is read-only). Recording, completing and
// waiving consequences are separate capabilities. The organization's real rules are examples-free: nothing is created or
// charged unless an authorized person defines and attaches a rule.
type RuleFields = Omit<Prisma.ConsequenceRuleUncheckedCreateInput, "id" | "organizationId" | "active" | "createdAt">;

function parseRule(fd: FormData): { error: string } | { data: RuleFields } {
  const name = z.string().trim().min(3, "Rule name is required.").max(120).safeParse(fd.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const trigger = z.enum(["ABSENT", "LATE"]).safeParse(fd.get("trigger") || "ABSENT");
  const penaltyType = z.enum(["FINE", "SERVICE_HOURS"]).safeParse(fd.get("penaltyType") || "FINE");
  const sessionKind = z.enum(["TIME_IN", "TIME_OUT", ""]).safeParse(fd.get("sessionKind") ?? "");
  if (!trigger.success || !penaltyType.success || !sessionKind.success) return { error: "Check the rule settings." };
  const wholeDay = fd.get("wholeDay") === "on";
  if (wholeDay && trigger.data !== "ABSENT") return { error: "A whole-day rule can only apply to absences." };

  let fineAmount: Prisma.Decimal | null = null;
  let serviceHours: Prisma.Decimal | null = null;
  if (penaltyType.data === "FINE") {
    fineAmount = parseAmount((fd.get("fineAmount") ?? "").toString());
    if (!fineAmount || fineAmount.lte(0)) return { error: "Enter the fine amount, like 50 or 100.00." };
  } else {
    const hours = Number((fd.get("serviceHours") ?? "").toString());
    if (!Number.isFinite(hours) || hours <= 0 || hours > 200) return { error: "Enter the community service hours (more than 0)." };
    serviceHours = new Prisma.Decimal(hours.toFixed(1));
  }
  const description = (fd.get("description") ?? "").toString().trim().slice(0, 500) || null;
  return { data: { name: name.data, description, trigger: trigger.data, penaltyType: penaltyType.data, sessionKind: sessionKind.data || null, wholeDay, fineAmount, serviceHours } };
}

const isDuplicateName = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Loads a rule and checks consequences.rules in the rule's own organization (never one taken from the form). */
async function ruleForEdit(fd: FormData) {
  const id = uuid.safeParse(fd.get("ruleId"));
  if (!id.success) return null;
  const rule = await db.consequenceRule.findUnique({ where: { id: id.data } });
  if (!rule) return null;
  const actor = await assertOrgPermission("consequences.rules", rule.organizationId);
  return { rule, actor };
}

export async function createRuleAction(_prev: ConsequenceState, fd: FormData): Promise<ConsequenceState> {
  const orgId = uuid.safeParse(fd.get("organizationId"));
  if (!orgId.success) return { error: "Choose an organization." };
  const actor = await assertOrgPermission("consequences.rules", orgId.data);
  const parsed = parseRule(fd);
  if ("error" in parsed) return { error: parsed.error };
  try {
    const rule = await db.consequenceRule.create({ data: { organizationId: orgId.data, ...parsed.data } });
    await db.auditLog.create({ data: { actorUserId: actor.id, action: "consequence_rule.create", targetType: "consequence_rule", targetId: rule.id } });
  } catch (e) {
    if (isDuplicateName(e)) return { error: "A rule with this name already exists." };
    throw e;
  }
  return { success: "Rule added. Attach it to an event to apply it." };
}

/** Changes apply to sessions finalized afterwards; consequences already recorded keep the penalty they copied. */
export async function updateRuleAction(_prev: ConsequenceState, fd: FormData): Promise<ConsequenceState> {
  const found = await ruleForEdit(fd);
  if (!found) return { error: "That rule no longer exists." };
  const parsed = parseRule(fd);
  if ("error" in parsed) return { error: parsed.error };
  try {
    await db.consequenceRule.update({ where: { id: found.rule.id }, data: parsed.data });
  } catch (e) {
    if (isDuplicateName(e)) return { error: "A rule with this name already exists." };
    throw e;
  }
  await db.auditLog.create({ data: { actorUserId: found.actor.id, action: "consequence_rule.update", targetType: "consequence_rule", targetId: found.rule.id } });
  return { success: "Rule saved." };
}

export async function toggleRuleAction(fd: FormData) {
  const found = await ruleForEdit(fd);
  if (!found) return;
  const { rule, actor } = found;
  await db.consequenceRule.update({ where: { id: rule.id }, data: { active: !rule.active } });
  await db.auditLog.create({ data: { actorUserId: actor.id, action: rule.active ? "consequence_rule.deactivate" : "consequence_rule.activate", targetType: "consequence_rule", targetId: rule.id } });
}

/** Only a rule that never produced a consequence can be deleted (records keep their policy); otherwise deactivate it.
 *  Deleting also detaches it from events. */
export async function deleteRuleAction(fd: FormData) {
  const found = await ruleForEdit(fd);
  if (!found) return;
  const { rule, actor } = found;
  const { count } = await db.consequenceRule.deleteMany({ where: { id: rule.id, consequences: { none: {} } } });
  if (count) await db.auditLog.create({ data: { actorUserId: actor.id, action: "consequence_rule.delete", targetType: "consequence_rule", targetId: rule.id, metadata: { name: rule.name } } });
}

export async function createConsequenceAction(_prev: ConsequenceState, fd: FormData): Promise<ConsequenceState> {
  const parsed = z.object({
    organizationId: uuid, userId: uuid,
    ruleId: z.string().transform((v) => v || null).pipe(uuid.nullable()),
    eventId: z.string().transform((v) => v || null).pipe(uuid.nullable()),
    reason: z.string().trim().min(3, "Enter the reason.").max(500),
  }).safeParse(Object.fromEntries(["organizationId", "userId", "ruleId", "eventId", "reason"].map((k) => [k, (fd.get(k) ?? "").toString()])));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { organizationId, userId, ruleId, eventId, reason } = parsed.data;
  const actor = await assertOrgPermission("consequences.manage", organizationId);

  // Everything referenced must belong to this same organization.
  const [member, rule, event] = await Promise.all([
    db.organizationMember.findFirst({ where: { organizationId, userId, endedAt: null }, select: { id: true } }),
    ruleId ? db.consequenceRule.findFirst({ where: { id: ruleId, organizationId, active: true } }) : null,
    eventId ? db.event.findFirst({ where: { id: eventId, organizationId }, select: { id: true } }) : null,
  ]);
  if (!member) return { error: "That person is not an active member of this organization." };
  if (ruleId && !rule) return { error: "Choose a rule from this organization." };
  if (eventId && !event) return { error: "Choose an event from this organization." };

  const c = await db.$transaction(async (tx) => createManualConsequence(tx, { organizationId, userId, rule, eventId, reason, createdById: actor.id }));
  await db.auditLog.create({ data: { actorUserId: actor.id, action: "consequence.create", targetType: "consequence", targetId: c.id, metadata: { userId } } });
  await notify([userId], { kind: "consequence", title: "A consequence was recorded for you", body: reason.slice(0, 120), href: "/consequences" });
  return { success: "Consequence recorded." };
}

export async function updateConsequenceStatusAction(fd: FormData) {
  const parsed = z.object({ consequenceId: uuid, status: z.enum(["COMPLETED", "WAIVED"]), note: z.string().max(500) }).safeParse({
    consequenceId: fd.get("consequenceId"), status: fd.get("status"), note: (fd.get("note") ?? "").toString().trim(),
  });
  if (!parsed.success) return;
  const c = await db.consequence.findUnique({ where: { id: parsed.data.consequenceId }, include: { assessment: { include: { adjustments: true, payments: true } } } });
  if (!c || c.status !== "PENDING") return;
  // Completing needs manage rights; waiving uses its own capability (President).
  const actor = await assertOrgPermission(parsed.data.status === "WAIVED" ? "consequences.waive" : "consequences.manage", c.organizationId);

  // A fine is completed by paying it (the ledger does this automatically); only service obligations are completed by hand.
  if (parsed.data.status === "COMPLETED" && c.kind === "FINE" && c.assessment) return;

  await db.consequence.update({ where: { id: c.id }, data: { status: parsed.data.status, note: parsed.data.note || null, resolvedAt: new Date(), resolvedById: actor.id } });
  await db.auditLog.create({ data: { actorUserId: actor.id, action: `consequence.${parsed.data.status.toLowerCase()}`, targetType: "consequence", targetId: c.id } });

  // Waiving a fine also clears what is still unpaid on the ledger.
  if (parsed.data.status === "WAIVED" && c.assessment) {
    const l = ledger(c.assessment);
    if (l.balance.gt(0)) await adjustLedger(actor.id, c.assessment.id, "WAIVER", l.balance, `Consequence waived${parsed.data.note ? `: ${parsed.data.note}` : ""}`);
  }
}
