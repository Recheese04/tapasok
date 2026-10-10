"use server";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { requireUser } from "@/lib/auth/dal";
import { assertOrgPermission } from "@/lib/permissions";
import { checkUpload, saveBytes } from "@/features/documents/storage";
import { assessMember, assignFeeToMembers, createFeeType, adjustLedger, parseAmount, recordPayment, submitDigitalPayment, verifyPayment, voidPayment } from "./service";

export type FeeState = { error?: string; success?: string };
const uuid = z.uuid();
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

// Each action authorizes against the organization that OWNS the record, never one supplied by the client.

export async function createFeeTypeAction(_prev: FeeState, fd: FormData): Promise<FeeState> {
  const orgId = uuid.safeParse(fd.get("organizationId"));
  if (!orgId.success) return { error: "Choose an organization." };
  const actor = await assertOrgPermission("fees.manage", orgId.data);

  const name = z.string().trim().min(2, "Enter a fee name.").max(120).safeParse(fd.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const amount = parseAmount((fd.get("amount") ?? "").toString());
  if (!amount) return { error: "Enter an amount like 150 or 150.50." };
  const kind = z.enum(["DUES", "SEMESTER_FEE", "EVENT_CONTRIBUTION", "SPECIAL"]).safeParse(fd.get("kind") || "DUES");
  if (!kind.success) return { error: "Choose the type of fee." };
  const eventId = z.union([uuid, z.literal("")]).safeParse(fd.get("eventId") ?? "");
  if (kind.data === "EVENT_CONTRIBUTION" && !(eventId.success && eventId.data)) return { error: "Choose the event for an event contribution." };
  const due = (fd.get("dueDate") ?? "").toString();
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:59+08:00`) : null;

  const res = await createFeeType(actor.id, orgId.data, {
    name: name.data, amount, dueDate, kind: kind.data, eventId: kind.data === "EVENT_CONTRIBUTION" && eventId.success ? eventId.data || null : null,
    description: (fd.get("description") ?? "").toString().trim().slice(0, 300) || null,
  });
  return res.ok ? { success: "Fee created. Assess it to members from the list below." } : { error: res.error };
}

async function feeTypeOrg(feeTypeId: string) {
  return db.feeType.findUnique({ where: { id: feeTypeId }, select: { organizationId: true } });
}

export async function assignFeeAction(fd: FormData) {
  const id = uuid.safeParse(fd.get("feeTypeId"));
  if (!id.success) return;
  const fee = await feeTypeOrg(id.data);
  if (!fee) return;
  const actor = await assertOrgPermission("fees.manage", fee.organizationId);
  await assignFeeToMembers(actor.id, id.data);
}

export async function assessMemberAction(_prev: FeeState, fd: FormData): Promise<FeeState> {
  const id = uuid.safeParse(fd.get("feeTypeId"));
  if (!id.success) return { error: "Choose a fee." };
  const fee = await feeTypeOrg(id.data);
  if (!fee) return { error: "Fee not found." };
  const actor = await assertOrgPermission("fees.manage", fee.organizationId);
  const number = (fd.get("studentNumber") ?? "").toString().trim();
  if (!number) return { error: "Enter the student number." };
  const res = await assessMember(actor.id, id.data, number);
  return res.ok ? { success: "Assessed." } : { error: res.error };
}

const paymentSchema = z.object({
  studentFeeId: uuid,
  method: z.enum(["CASH", "GCASH", "BANK_TRANSFER", "OTHER"]),
  reference: z.string().trim().max(100),
});

async function orgOfAssessment(studentFeeId: string) {
  return db.studentFee.findUnique({ where: { id: studentFeeId }, select: { organizationId: true } });
}

export async function recordPaymentAction(_prev: FeeState, fd: FormData): Promise<FeeState> {
  const parsed = paymentSchema.safeParse({ studentFeeId: fd.get("studentFeeId"), method: fd.get("method"), reference: (fd.get("reference") ?? "").toString() });
  if (!parsed.success) return { error: "Check the payment details." };
  const amount = parseAmount((fd.get("amount") ?? "").toString());
  if (!amount) return { error: "Enter an amount like 150 or 150.50." };

  const sf = await orgOfAssessment(parsed.data.studentFeeId);
  if (!sf) return { error: "Assessment not found." };
  const actor = await assertOrgPermission("fees.manage", sf.organizationId);

  const res = await recordPayment(actor.id, parsed.data.studentFeeId, { amount, method: parsed.data.method, reference: parsed.data.reference || null });
  return res.ok ? { success: `Payment recorded. Receipt ${res.receiptCode}` } : { error: res.error };
}

/** A student pays digitally and uploads proof. Nothing is marked paid until an officer verifies it. */
export async function submitDigitalPaymentAction(_prev: FeeState, fd: FormData): Promise<FeeState> {
  const user = await requireUser();
  const parsed = z.object({ studentFeeId: uuid, method: z.enum(["GCASH", "BANK_TRANSFER", "OTHER"]), reference: z.string().trim().min(3, "Enter the payment reference number.").max(100) })
    .safeParse({ studentFeeId: fd.get("studentFeeId"), method: fd.get("method"), reference: (fd.get("reference") ?? "").toString() });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the payment details." };
  const amount = parseAmount((fd.get("amount") ?? "").toString());
  if (!amount) return { error: "Enter an amount like 150 or 150.50." };

  const proof = fd.get("proof");
  if (!(proof instanceof File) || proof.size === 0) return { error: "Attach a screenshot or receipt as proof of payment." };
  if (proof.size > MAX_PROOF_BYTES) return { error: "The proof file is larger than 5 MB." };
  const bytes = Buffer.from(await proof.arrayBuffer());
  const check = checkUpload(proof.name, bytes);
  if (!check.ok || !["application/pdf", "image/png", "image/jpeg"].includes(check.mime)) return { error: "Proof must be a PDF, PNG or JPG file." };

  // Ownership is verified in the service (the assessment must belong to this student).
  const own = await db.studentFee.findUnique({ where: { id: parsed.data.studentFeeId }, select: { userId: true } });
  if (!own || own.userId !== user.id) return { error: "Assessment not found." };
  const proofKey = await saveBytes(bytes);
  const res = await submitDigitalPayment(user.id, parsed.data.studentFeeId, { amount, method: parsed.data.method, reference: parsed.data.reference, proofKey, proofMime: check.mime });
  return res.ok ? { success: `Submitted for verification. Reference ${res.receiptCode}` } : { error: res.error };
}

export async function verifyPaymentAction(fd: FormData) {
  const id = uuid.safeParse(fd.get("paymentId"));
  if (!id.success) return;
  const p = await db.payment.findUnique({ where: { id: id.data }, select: { studentFee: { select: { organizationId: true } } } });
  if (!p) return;
  const actor = await assertOrgPermission("fees.manage", p.studentFee.organizationId);
  await verifyPayment(actor.id, id.data, fd.get("decision") === "approve", (fd.get("reason") ?? "").toString() || null);
}

export async function voidPaymentAction(fd: FormData) {
  const id = uuid.safeParse(fd.get("paymentId"));
  const reason = z.string().trim().min(3).max(300).safeParse(fd.get("reason"));
  if (!id.success || !reason.success) return;
  const p = await db.payment.findUnique({ where: { id: id.data }, select: { studentFee: { select: { organizationId: true } } } });
  if (!p) return;
  const actor = await assertOrgPermission("fees.manage", p.studentFee.organizationId);
  await voidPayment(actor.id, id.data, reason.data);
}

export async function adjustLedgerAction(_prev: FeeState, fd: FormData): Promise<FeeState> {
  const parsed = z.object({ studentFeeId: uuid, type: z.enum(["WAIVER", "DISCOUNT", "CORRECTION", "CHARGE", "REFUND"]), reason: z.string().trim().min(3, "Enter the reason.").max(300) })
    .safeParse({ studentFeeId: fd.get("studentFeeId"), type: fd.get("type"), reason: (fd.get("reason") ?? "").toString() });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const amount = parseAmount((fd.get("amount") ?? "").toString());
  if (!amount) return { error: "Enter an amount like 150 or 150.50." };
  const sf = await orgOfAssessment(parsed.data.studentFeeId);
  if (!sf) return { error: "Assessment not found." };
  const actor = await assertOrgPermission("fees.manage", sf.organizationId);
  const res = await adjustLedger(actor.id, parsed.data.studentFeeId, parsed.data.type, amount, parsed.data.reason);
  return res.ok ? { success: "Ledger adjusted." } : { error: res.error };
}

/**
 * Edits a fee's details. Members who were already assessed keep the amount they were assessed (their ledger is history);
 * the new amount applies to people assessed from now on.
 */
export async function updateFeeTypeAction(_prev: FeeState, fd: FormData): Promise<FeeState> {
  const id = uuid.safeParse(fd.get("feeTypeId"));
  if (!id.success) return { error: "Fee not found." };
  const fee = await feeTypeOrg(id.data);
  if (!fee) return { error: "Fee not found." };
  const actor = await assertOrgPermission("fees.manage", fee.organizationId);

  const name = z.string().trim().min(2, "Enter a fee name.").max(120).safeParse(fd.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const amount = parseAmount((fd.get("amount") ?? "").toString());
  if (!amount || amount.lte(0)) return { error: "Enter an amount like 150 or 150.50." };
  const due = (fd.get("dueDate") ?? "").toString();
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:59+08:00`) : null;
  const description = (fd.get("description") ?? "").toString().trim().slice(0, 300) || null;
  try {
    await db.$transaction([
      db.feeType.update({ where: { id: id.data }, data: { name: name.data, amount, dueDate, description } }),
      db.auditLog.create({ data: { actorUserId: actor.id, action: "fee_type.update", targetType: "fee_type", targetId: id.data } }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "A fee with this name already exists." };
    throw e;
  }
  return { success: "Fee saved." };
}

/** Deactivating stops new assessments; existing assessments, payments and history are untouched. */
export async function setFeeTypeActiveAction(fd: FormData) {
  const id = uuid.safeParse(fd.get("feeTypeId"));
  if (!id.success) return;
  const fee = await db.feeType.findUnique({ where: { id: id.data }, select: { organizationId: true } });
  if (!fee) return;
  const actor = await assertOrgPermission("fees.manage", fee.organizationId);
  const active = fd.get("active") === "true";
  await db.$transaction([
    db.feeType.update({ where: { id: id.data }, data: { active } }),
    db.auditLog.create({ data: { actorUserId: actor.id, action: active ? "fee_type.activate" : "fee_type.deactivate", targetType: "fee_type", targetId: id.data } }),
  ]);
}

/** A fee that was never assessed to anyone can be deleted outright; otherwise it is deactivated to keep the ledger. */
export async function deleteFeeTypeAction(fd: FormData) {
  const id = uuid.safeParse(fd.get("feeTypeId"));
  if (!id.success) return;
  const fee = await db.feeType.findUnique({ where: { id: id.data }, select: { organizationId: true, _count: { select: { assignments: true } } } });
  if (!fee) return;
  const actor = await assertOrgPermission("fees.manage", fee.organizationId);
  if (fee._count.assignments > 0) return;
  await db.$transaction([
    db.feeType.delete({ where: { id: id.data } }),
    db.auditLog.create({ data: { actorUserId: actor.id, action: "fee_type.delete", targetType: "fee_type", targetId: id.data } }),
  ]);
}
