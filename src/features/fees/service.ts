import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { AdjustmentType, AssessmentKind } from "@/generated/prisma/enums";
import { db } from "@/lib/database/client";
import { getActiveTerm } from "@/features/academic/service";
import { expectedAttendeeIds } from "@/features/attendance/eligibility";
import { notify } from "@/features/notifications/service";
import { ledger, newReceiptCode } from "./ledger";
import { finAudit } from "@/features/finance/audit";

// Money rules. Callers authorize the actor against the assessment's organization first.
// Every balance-changing operation locks the assessment row, so concurrent payments, adjustments and
// verifications can never push a balance past what is owed.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const AMOUNT_RE = /^\d{1,8}(\.\d{1,2})?$/;
export const parseAmount = (s: string) => (AMOUNT_RE.test(s.trim()) ? new Prisma.Decimal(s.trim()) : null);
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const lock = (tx: Prisma.TransactionClient, id: string) => tx.$queryRaw`SELECT 1 FROM "student_fees" WHERE "id" = ${id}::uuid FOR UPDATE`;

const fullFee = { adjustments: true, payments: true } as const;

export async function createFeeType(
  actorId: string, organizationId: string,
  input: { name: string; amount: Prisma.Decimal; description: string | null; dueDate: Date | null; kind: Exclude<AssessmentKind, "FINE">; eventId: string | null },
): Promise<Result<{ id: string }>> {
  if (input.amount.lte(0)) return { ok: false, error: "The amount must be greater than zero." };
  if (input.eventId && !(await db.event.findFirst({ where: { id: input.eventId, organizationId }, select: { id: true } }))) return { ok: false, error: "Choose an event of this organization." };
  const term = await getActiveTerm();
  try {
    const fee = await db.feeType.create({ data: { organizationId, ...input, semesterId: term?.semester.id ?? null } });
    await db.auditLog.create({ data: { actorUserId: actorId, action: "fee_type.create", targetType: "fee_type", targetId: fee.id } });
    await finAudit(db, { organizationId, action: "fee_type.create", entityType: "fee_type", entityId: fee.id, amount: input.amount, actorId, after: { name: input.name, amount: input.amount.toFixed(2), kind: input.kind } });
    return { ok: true, id: fee.id };
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "A fee with this name already exists." };
    throw e;
  }
}

/**
 * Assesses the fee. Dues/semester fees/special assessments go to every active member; event contributions go to the
 * event's expected attendees. Re-running only adds people who don't have it yet.
 */
export async function assignFeeToMembers(actorId: string, feeTypeId: string): Promise<Result<{ assigned: number }>> {
  const fee = await db.feeType.findUnique({ where: { id: feeTypeId }, include: { event: true } });
  if (!fee || !fee.active) return { ok: false, error: "This fee is not active." };

  let userIds: string[];
  if (fee.kind === "EVENT_CONTRIBUTION" && fee.event) userIds = await expectedAttendeeIds(fee.event);
  else userIds = (await db.organizationMember.findMany({ where: { organizationId: fee.organizationId, endedAt: null, user: { status: { not: "DISABLED" } } }, select: { userId: true }, distinct: ["userId"] })).map((m) => m.userId);

  const res = await db.studentFee.createMany({
    data: userIds.map((userId) => ({ feeTypeId, userId, organizationId: fee.organizationId, title: fee.name, kind: fee.kind, amountDue: fee.amount, semesterId: fee.semesterId, eventId: fee.eventId })),
    skipDuplicates: true,
  });
  await db.auditLog.create({ data: { actorUserId: actorId, action: "fee.assign", targetType: "fee_type", targetId: feeTypeId, metadata: { assigned: res.count } } });
  await finAudit(db, { organizationId: fee.organizationId, action: "fee.assign", entityType: "fee_type", entityId: feeTypeId, amount: fee.amount.mul(res.count), actorId, after: { fee: fee.name, membersAssessed: res.count, amountEach: fee.amount.toFixed(2) } });
  return { ok: true, assigned: res.count };
}

/** Assess a single member (special assessments). The member must belong to the organization. */
export async function assessMember(actorId: string, feeTypeId: string, studentNumber: string): Promise<Result> {
  const fee = await db.feeType.findUnique({ where: { id: feeTypeId } });
  if (!fee || !fee.active) return { ok: false, error: "This fee is not active." };
  const member = await db.organizationMember.findFirst({
    where: { organizationId: fee.organizationId, endedAt: null, user: { studentProfile: { studentNumber } } }, select: { userId: true },
  });
  if (!member) return { ok: false, error: "No active member with that student number in this organization." };
  try {
    await db.studentFee.create({ data: { feeTypeId, userId: member.userId, organizationId: fee.organizationId, title: fee.name, kind: fee.kind, amountDue: fee.amount, semesterId: fee.semesterId, eventId: fee.eventId } });
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "This member already has that assessment." };
    throw e;
  }
  await db.auditLog.create({ data: { actorUserId: actorId, action: "fee.assess_member", targetType: "fee_type", targetId: feeTypeId, metadata: { userId: member.userId } } });
  await finAudit(db, { organizationId: fee.organizationId, action: "fee.assess_member", entityType: "fee_type", entityId: feeTypeId, amount: fee.amount, actorId, after: { fee: fee.name, userId: member.userId } });
  return { ok: true };
}

/** A fine/consequence is completed when its assessment is fully paid, and reopened if that is undone. */
async function syncConsequence(tx: Prisma.TransactionClient, studentFeeId: string) {
  const fee = await tx.studentFee.findUnique({ where: { id: studentFeeId }, include: fullFee });
  if (!fee?.consequenceId) return;
  const { balance } = ledger(fee);
  const c = await tx.consequence.findUnique({ where: { id: fee.consequenceId }, select: { status: true } });
  if (!c) return;
  if (c.status === "PENDING" && balance.lte(0)) await tx.consequence.update({ where: { id: fee.consequenceId }, data: { status: "COMPLETED", resolvedAt: new Date() } });
  else if (c.status === "COMPLETED" && balance.gt(0)) await tx.consequence.update({ where: { id: fee.consequenceId }, data: { status: "PENDING", resolvedAt: null } });
}

async function createPayment(tx: Prisma.TransactionClient, data: Omit<Prisma.PaymentUncheckedCreateInput, "receiptCode">) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await tx.payment.create({ data: { ...data, receiptCode: newReceiptCode() } });
    } catch (e) {
      if (!isUnique(e)) throw e;
    }
  }
  throw new Error("Could not allocate a receipt code.");
}

/** Cash (or any in-person) payment recorded by an authorized officer: confirmed immediately with a receipt code. */
export async function recordPayment(
  actorId: string, studentFeeId: string,
  input: { amount: Prisma.Decimal; method: "CASH" | "GCASH" | "BANK_TRANSFER" | "OTHER"; reference: string | null },
): Promise<Result<{ paymentId: string; receiptCode: string }>> {
  if (input.amount.lte(0)) return { ok: false, error: "The amount must be greater than zero." };
  return db.$transaction(async (tx) => {
    await lock(tx, studentFeeId);
    const fee = await tx.studentFee.findUnique({ where: { id: studentFeeId }, include: fullFee });
    if (!fee) return { ok: false as const, error: "Assessment not found." };
    const { balance } = ledger(fee);
    if (input.amount.gt(balance)) return { ok: false as const, error: `The payment exceeds the remaining balance (₱${balance.toFixed(2)}).` };
    const payment = await createPayment(tx, { studentFeeId, ...input, status: "CONFIRMED", recordedById: actorId, verifiedById: actorId, verifiedAt: new Date() });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "payment.record", targetType: "payment", targetId: payment.id, metadata: { amount: input.amount.toFixed(2), receipt: payment.receiptCode } } });
    await finAudit(tx, { organizationId: fee.organizationId, action: "payment.record", entityType: "payment", entityId: payment.id, amount: input.amount, actorId, after: { status: "CONFIRMED", method: input.method, receipt: payment.receiptCode, fee: fee.title, userId: fee.userId } });
    await syncConsequence(tx, studentFeeId);
    return { ok: true as const, paymentId: payment.id, receiptCode: payment.receiptCode };
  });
}

/** A student submits a digital payment with proof. It stays PENDING and does NOT reduce the balance until verified. */
export async function submitDigitalPayment(
  studentId: string, studentFeeId: string,
  input: { amount: Prisma.Decimal; method: "CASH" | "GCASH" | "BANK_TRANSFER" | "OTHER"; reference: string; proofKey: string | null; proofMime: string | null },
): Promise<Result<{ receiptCode: string }>> {
  if (input.amount.lte(0)) return { ok: false, error: "The amount must be greater than zero." };
  if (!input.reference.trim()) return { ok: false, error: "Enter the payment reference number." };
  return db.$transaction(async (tx) => {
    await lock(tx, studentFeeId);
    const fee = await tx.studentFee.findUnique({ where: { id: studentFeeId }, include: fullFee });
    if (!fee || fee.userId !== studentId) return { ok: false as const, error: "Assessment not found." };
    const { balance, pending } = ledger(fee);
    if (input.amount.gt(balance.sub(pending))) return { ok: false as const, error: `That is more than you still owe (₱${balance.sub(pending).toFixed(2)} after pending payments).` };
    const payment = await createPayment(tx, { studentFeeId, amount: input.amount, method: input.method, reference: input.reference.trim(), status: "PENDING", proofKey: input.proofKey, proofMime: input.proofMime, submittedById: studentId });
    await tx.auditLog.create({ data: { actorUserId: studentId, action: "payment.submit", targetType: "payment", targetId: payment.id } });
    await finAudit(tx, { organizationId: fee.organizationId, action: "payment.submit", entityType: "payment", entityId: payment.id, amount: input.amount, actorId: studentId, after: { status: "PENDING", method: input.method, reference: input.reference, receipt: payment.receiptCode, fee: fee.title } });
    return { ok: true as const, receiptCode: payment.receiptCode };
  });
}

/** Confirms or rejects a pending digital payment (reason required to reject). */
export async function verifyPayment(actorId: string, paymentId: string, approve: boolean, reason: string | null): Promise<Result> {
  if (!approve && !reason?.trim()) return { ok: false, error: "Enter a reason for rejecting this payment." };
  const p = await db.payment.findUnique({ where: { id: paymentId }, select: { studentFeeId: true, submittedById: true, receiptCode: true, amount: true, studentFee: { select: { organizationId: true } } } });
  if (!p) return { ok: false, error: "Payment not found." };
  const result = await db.$transaction(async (tx) => {
    await lock(tx, p.studentFeeId);
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== "PENDING" || payment.voidedAt) return { ok: false as const, error: "This payment was already reviewed." };
    if (approve) {
      const fee = await tx.studentFee.findUniqueOrThrow({ where: { id: p.studentFeeId }, include: fullFee });
      const { balance } = ledger(fee);
      if (payment.amount.gt(balance)) return { ok: false as const, error: `Confirming would exceed the balance (₱${balance.toFixed(2)}). Reject it or adjust the ledger first.` };
    }
    await tx.payment.update({
      where: { id: paymentId },
      data: approve ? { status: "CONFIRMED", verifiedById: actorId, verifiedAt: new Date() } : { status: "REJECTED", verifiedById: actorId, verifiedAt: new Date(), rejectionReason: reason!.trim().slice(0, 300) },
    });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: approve ? "payment.confirm" : "payment.reject", targetType: "payment", targetId: paymentId, metadata: reason ? { reason } : undefined } });
    await finAudit(tx, { organizationId: p.studentFee.organizationId, action: approve ? "payment.confirm" : "payment.reject", entityType: "payment", entityId: paymentId, amount: p.amount, actorId, before: { status: "PENDING" }, after: { status: approve ? "CONFIRMED" : "REJECTED" }, reason });
    await syncConsequence(tx, p.studentFeeId);
    return { ok: true as const };
  });
  if (result.ok && p.submittedById) {
    await notify([p.submittedById], { kind: "payment", title: approve ? "Your payment was confirmed" : "Your payment was rejected", body: approve ? `Receipt ${p.receiptCode}` : reason?.trim(), href: "/fees" });
  }
  return result;
}

export async function voidPayment(actorId: string, paymentId: string, reason: string): Promise<Result> {
  const p = await db.payment.findUnique({ where: { id: paymentId }, select: { studentFeeId: true, amount: true, status: true, studentFee: { select: { organizationId: true } } } });
  if (!p) return { ok: false, error: "Payment not found." };
  return db.$transaction(async (tx) => {
    await lock(tx, p.studentFeeId);
    const { count } = await tx.payment.updateMany({ where: { id: paymentId, voidedAt: null }, data: { voidedAt: new Date(), voidReason: reason } });
    if (count === 0) return { ok: false as const, error: "Payment not found or already voided." };
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "payment.void", targetType: "payment", targetId: paymentId, metadata: { reason } } });
    await finAudit(tx, { organizationId: p.studentFee.organizationId, action: "payment.void", entityType: "payment", entityId: paymentId, amount: p.amount, actorId, before: { status: p.status, voided: false }, after: { status: p.status, voided: true }, reason });
    await syncConsequence(tx, p.studentFeeId);
    return { ok: true as const };
  });
}

/**
 * Signed adjustments keep history intact. Waivers/discounts reduce what is owed (never below zero owed),
 * charges increase it, corrections go either way, and refunds restore a credit that was paid back out.
 */
export async function adjustLedger(actorId: string, studentFeeId: string, type: AdjustmentType, magnitude: Prisma.Decimal, reason: string): Promise<Result> {
  if (magnitude.lte(0)) return { ok: false, error: "Enter an amount greater than zero." };
  if (!reason.trim()) return { ok: false, error: "Enter the reason for this adjustment." };
  return db.$transaction(async (tx) => {
    await lock(tx, studentFeeId);
    const fee = await tx.studentFee.findUnique({ where: { id: studentFeeId }, include: fullFee });
    if (!fee) return { ok: false as const, error: "Assessment not found." };
    const { balance } = ledger(fee);

    let amount = magnitude;
    if (type === "WAIVER" || type === "DISCOUNT") {
      if (magnitude.gt(balance)) return { ok: false as const, error: `You can only waive up to the outstanding balance (₱${balance.toFixed(2)}).` };
      amount = magnitude.neg();
    } else if (type === "REFUND") {
      if (magnitude.gt(balance.neg())) return { ok: false as const, error: balance.lt(0) ? `A refund can be at most the credit on the account (₱${balance.neg().toFixed(2)}).` : "There is no credit to refund." };
    } else if (type === "CORRECTION") {
      // Corrections reduce what is owed (a mistaken charge); use CHARGE to increase it.
      if (magnitude.gt(balance)) return { ok: false as const, error: `A correction can reduce the balance by at most ₱${balance.toFixed(2)}.` };
      amount = magnitude.neg();
    }
    await tx.ledgerAdjustment.create({ data: { studentFeeId, type, amount, reason: reason.trim().slice(0, 300), createdById: actorId } });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "ledger.adjust", targetType: "student_fee", targetId: studentFeeId, metadata: { type, amount: amount.toFixed(2) } } });
    await finAudit(tx, { organizationId: fee.organizationId, action: "ledger.adjust", entityType: "student_fee", entityId: studentFeeId, amount, actorId, before: { balance: balance.toFixed(2) }, after: { balance: balance.add(amount).toFixed(2), type }, reason });
    await syncConsequence(tx, studentFeeId);
    return { ok: true as const };
  });
}
