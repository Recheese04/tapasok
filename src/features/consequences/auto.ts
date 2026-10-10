import "server-only";
import { Prisma } from "@/generated/prisma/client";

// Automatic consequence calculation. Runs inside the attendance finalize/adjust transactions.
//  * Only rules attached to the event apply, and only active ones.
//  * Only finalized ABSENT/LATE records create consequences; EXCUSED (and PRESENT) never do.
//  * Duplicates are impossible: partial unique indexes on (rule, session|event, user) plus skipDuplicates,
//    so finalizing, recalculating or correcting again never creates a second one.
//  * A FINE also creates its ledger assessment; correcting a record to EXCUSED/PRESENT cancels a still-pending
//    consequence and clears its unpaid fine.

type Tx = Prisma.TransactionClient;
type Rule = { id: string; name: string; trigger: "ABSENT" | "LATE"; sessionKind: "TIME_IN" | "TIME_OUT" | null; wholeDay: boolean; penaltyType: "FINE" | "SERVICE_HOURS"; fineAmount: Prisma.Decimal | null; serviceHours: Prisma.Decimal | null };

const sessionRules = (rules: Rule[], kind: "TIME_IN" | "TIME_OUT") => rules.filter((r) => !r.wholeDay && (r.sessionKind === null || r.sessionKind === kind));

async function loadContext(tx: Tx, sessionId: string) {
  const session = await tx.eventSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { event: { include: { rules: { include: { rule: true } }, sessions: { select: { id: true, finalizedAt: true } } } } },
  });
  const rules: Rule[] = session.event.rules.map((r) => r.rule).filter((r) => r.active);
  return { session, event: session.event, rules };
}

/** Creates consequence rows (skipping any that already exist) and the ledger fines that belong to them. */
async function materialize(tx: Tx, rows: { rule: Rule; userId: string; organizationId: string; eventId: string; sessionId: string | null; eventTitle: string; semesterId: string | null; recordId: string | null; label: string }[]) {
  if (rows.length === 0) return 0;
  const now = new Date();
  const created = await tx.consequence.createMany({
    data: rows.map((r) => ({
      organizationId: r.organizationId, userId: r.userId, ruleId: r.rule.id, eventId: r.eventId, sessionId: r.sessionId,
      reason: `${r.rule.name}: ${r.rule.trigger === "ABSENT" ? "absent" : "late"} — ${r.eventTitle}${r.label ? ` (${r.label})` : ""}`,
      kind: r.rule.penaltyType, amount: r.rule.penaltyType === "FINE" ? r.rule.fineAmount : null, hours: r.rule.penaltyType === "SERVICE_HOURS" ? r.rule.serviceHours : null,
      calculatedAt: now, sourceRecordId: r.recordId,
    })),
    skipDuplicates: true,
  });
  if (created.count === 0) return 0;

  // Attach ledger fines to the consequences that were just created (they have no assessment yet).
  const fresh = await tx.consequence.findMany({
    where: { calculatedAt: now, kind: "FINE", amount: { not: null }, assessment: null, OR: rows.map((r) => ({ ruleId: r.rule.id, userId: r.userId, eventId: r.eventId, sessionId: r.sessionId })) },
    select: { id: true, organizationId: true, userId: true, amount: true, eventId: true, reason: true },
  });
  if (fresh.length) {
    const event = await tx.event.findUnique({ where: { id: fresh[0].eventId! }, select: { semesterId: true } });
    await tx.studentFee.createMany({
      data: fresh.map((c) => ({ organizationId: c.organizationId, userId: c.userId, title: c.reason.slice(0, 180), kind: "FINE" as const, amountDue: c.amount!, eventId: c.eventId, semesterId: event?.semesterId ?? null, consequenceId: c.id })),
      skipDuplicates: true,
    });
  }
  return created.count;
}

/** Called when a session is finalized. Also evaluates whole-day rules once every session of the event is final. */
export async function calculateConsequencesForSession(tx: Tx, sessionId: string): Promise<number> {
  const { session, event, rules } = await loadContext(tx, sessionId);
  if (rules.length === 0) return 0;
  let total = 0;

  const records = await tx.attendanceRecord.findMany({ where: { sessionId }, select: { id: true, userId: true, status: true } });
  const perSession = sessionRules(rules, session.kind);
  const base = { organizationId: event.organizationId, eventId: event.id, eventTitle: event.title, semesterId: event.semesterId };
  total += await materialize(tx, perSession.flatMap((rule) =>
    records.filter((r) => r.status === rule.trigger).map((r) => ({ ...base, rule, userId: r.userId, sessionId, recordId: r.id, label: session.label })),
  ));

  const wholeDay = rules.filter((r) => r.wholeDay && r.trigger === "ABSENT");
  if (wholeDay.length) total += await calculateWholeDay(tx, event.id, wholeDay);
  return total;
}

/** Whole-day rule: a student unexcused-absent from EVERY session of the event, once all sessions are final. */
async function calculateWholeDay(tx: Tx, eventId: string, wholeDay: Rule[]): Promise<number> {
  const event = await tx.event.findUniqueOrThrow({ where: { id: eventId }, include: { sessions: { select: { id: true, finalizedAt: true } } } });
  if (event.sessions.some((s) => !s.finalizedAt)) return 0;
  const records = await tx.attendanceRecord.findMany({ where: { eventId }, select: { id: true, userId: true, status: true } });
  const byUser = new Map<string, { id: string; status: string }[]>();
  for (const r of records) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  const absentAll = [...byUser.entries()].filter(([, rs]) => rs.length === event.sessions.length && rs.every((r) => r.status === "ABSENT"));
  return materialize(tx, wholeDay.flatMap((rule) => absentAll.map(([userId, rs]) => ({
    rule, userId, organizationId: event.organizationId, eventId, sessionId: null, eventTitle: event.title, semesterId: event.semesterId, recordId: rs[0].id, label: "whole day",
  }))));
}

/** Cancels a pending consequence and clears its unpaid fine (history stays: a negative adjustment, not a delete). */
async function cancelConsequence(tx: Tx, consequenceId: string) {
  const c = await tx.consequence.findUnique({ where: { id: consequenceId }, include: { assessment: { include: { adjustments: true, payments: true } } } });
  if (!c || c.status !== "PENDING") return;
  await tx.consequence.update({ where: { id: c.id }, data: { status: "CANCELLED", resolvedAt: new Date(), note: "Cancelled after the attendance record was corrected." } });
  const a = c.assessment;
  if (a) {
    const paid = a.payments.filter((p) => p.status === "CONFIRMED" && !p.voidedAt).reduce((s, p) => s.add(p.amount), new Prisma.Decimal(0));
    const effective = a.adjustments.reduce((s, x) => s.add(x.amount), a.amountDue);
    const reducible = effective.sub(paid); // only the unpaid part can be removed; paid money stays as a credit for the treasurer
    if (reducible.gt(0)) await tx.ledgerAdjustment.create({ data: { studentFeeId: a.id, type: "CORRECTION", amount: reducible.neg(), reason: "Consequence cancelled after an attendance correction." } });
  }
}

/** Reinstates a consequence that was cancelled by an earlier correction and restores its fine on the ledger. */
async function reactivateConsequence(tx: Tx, consequenceId: string) {
  const c = await tx.consequence.findUnique({ where: { id: consequenceId }, include: { assessment: { include: { adjustments: true } } } });
  if (!c || c.status !== "CANCELLED") return;
  await tx.consequence.update({ where: { id: c.id }, data: { status: "PENDING", resolvedAt: null, note: null } });
  const a = c.assessment;
  if (a) {
    const effective = a.adjustments.reduce((s, x) => s.add(x.amount), a.amountDue);
    const missing = a.amountDue.sub(effective); // how much of the original fine was removed
    if (missing.gt(0)) await tx.ledgerAdjustment.create({ data: { studentFeeId: a.id, type: "CHARGE", amount: missing, reason: "Consequence reinstated after an attendance correction." } });
  }
}

/** After a correction on a finalized session: create what newly applies, cancel what no longer does. */
export async function reconcileConsequencesForRecord(tx: Tx, recordId: string): Promise<void> {
  const rec = await tx.attendanceRecord.findUniqueOrThrow({ where: { id: recordId }, select: { id: true, userId: true, status: true, sessionId: true } });
  const { session, event, rules } = await loadContext(tx, rec.sessionId);
  if (rules.length === 0) return;
  const base = { organizationId: event.organizationId, eventId: event.id, eventTitle: event.title, semesterId: event.semesterId };

  for (const rule of sessionRules(rules, session.kind)) {
    if (rec.status === rule.trigger) {
      const existing = await tx.consequence.findFirst({ where: { ruleId: rule.id, sessionId: session.id, userId: rec.userId, calculatedAt: { not: null } } });
      if (existing) await reactivateConsequence(tx, existing.id);
      else await materialize(tx, [{ ...base, rule, userId: rec.userId, sessionId: session.id, recordId: rec.id, label: session.label }]);
    } else {
      const existing = await tx.consequence.findFirst({ where: { ruleId: rule.id, sessionId: session.id, userId: rec.userId, calculatedAt: { not: null } } });
      if (existing) await cancelConsequence(tx, existing.id);
    }
  }

  const wholeDay = rules.filter((r) => r.wholeDay && r.trigger === "ABSENT");
  if (wholeDay.length) {
    for (const rule of wholeDay) {
      const existing = await tx.consequence.findFirst({ where: { ruleId: rule.id, eventId: event.id, sessionId: null, userId: rec.userId, calculatedAt: { not: null } } });
      if (existing && rec.status !== "ABSENT") await cancelConsequence(tx, existing.id);
    }
    // Reinstate any whole-day consequence that applies again, then create ones that newly apply.
    for (const rule of wholeDay) {
      const cancelled = await tx.consequence.findFirst({ where: { ruleId: rule.id, eventId: event.id, sessionId: null, userId: rec.userId, calculatedAt: { not: null }, status: "CANCELLED" } });
      if (cancelled && rec.status === "ABSENT") {
        const sessionsOk = await tx.attendanceRecord.count({ where: { eventId: event.id, userId: rec.userId, status: { not: "ABSENT" } } });
        if (sessionsOk === 0) await reactivateConsequence(tx, cancelled.id);
      }
    }
    await calculateWholeDay(tx, event.id, wholeDay);
  }
}

/** Manual consequence from a rule: copies the rule's penalty and creates the ledger fine for FINE rules. */
export async function createManualConsequence(tx: Tx, input: { organizationId: string; userId: string; rule: Rule | null; eventId: string | null; reason: string; createdById: string }) {
  const c = await tx.consequence.create({
    data: {
      organizationId: input.organizationId, userId: input.userId, ruleId: input.rule?.id ?? null, eventId: input.eventId, reason: input.reason, createdById: input.createdById,
      kind: input.rule?.penaltyType ?? "FINE", amount: input.rule?.penaltyType === "FINE" ? input.rule.fineAmount : null, hours: input.rule?.penaltyType === "SERVICE_HOURS" ? input.rule.serviceHours : null,
    },
  });
  if (c.kind === "FINE" && c.amount) {
    await tx.studentFee.create({ data: { organizationId: c.organizationId, userId: c.userId, title: c.reason.slice(0, 180), kind: "FINE", amountDue: c.amount, eventId: c.eventId, consequenceId: c.id } });
  }
  return c;
}
