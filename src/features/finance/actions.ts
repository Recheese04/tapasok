"use server";

import { z } from "zod";
import type { FundCategory } from "@/generated/prisma/enums";
import { db } from "@/lib/database/client";
import { assertOrgPermission } from "@/lib/permissions";
import { parseAmount } from "@/features/fees/service";
import { checkUpload, MAX_UPLOAD_BYTES, saveBytes } from "@/features/documents/storage";
import { cancelFund, decideFund, editFund, EXPENSE_CATEGORIES, INCOME_CATEGORIES, recordFund, reverseFund } from "./funds";

// Every action re-reads the record's real organization from the database and checks the capability there; organization
// IDs, amounts and statuses from the form are never trusted. Status changes are decided by the service, not the form.

export type FundState = { error?: string; success?: string; id?: string };

const uuid = z.uuid();
const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString();
const RECEIPT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

async function readReceipt(fd: FormData): Promise<{ key: string; mime: string; name: string } | null | { error: string }> {
  const f = fd.get("receipt");
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_UPLOAD_BYTES) return { error: "The receipt is larger than 10 MB." };
  const bytes = Buffer.from(await f.arrayBuffer());
  const check = checkUpload(f.name, bytes);
  if (!check.ok) return { error: check.error };
  if (!RECEIPT_TYPES.has(check.mime)) return { error: "Attach the receipt as a PDF, PNG or JPG." };
  return { key: await saveBytes(bytes), mime: check.mime, name: f.name };
}

function fields(fd: FormData, type: "EXPENSE" | "INCOME") {
  const amount = parseAmount(str(fd, "amount"));
  const category = str(fd, "category") as FundCategory;
  const allowed: readonly string[] = type === "EXPENSE" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  if (!amount) return { error: "Enter an amount like 250 or 250.50." } as const;
  if (!allowed.includes(category)) return { error: "Choose a category." } as const;
  return {
    data: { title: str(fd, "title"), amount, category, occurredOn: str(fd, "occurredOn"), purpose: str(fd, "purpose"), notes: str(fd, "notes") || null },
  } as const;
}

export async function recordFundAction(_prev: FundState, fd: FormData): Promise<FundState> {
  const orgId = uuid.safeParse(fd.get("organizationId"));
  if (!orgId.success) return { error: "Choose an organization." };
  const actor = await assertOrgPermission("expenses.record", orgId.data);
  const type = str(fd, "type") === "INCOME" ? "INCOME" : "EXPENSE";
  const requestId = z.string().uuid().safeParse(fd.get("requestId"));
  if (!requestId.success) return { error: "Reload the page and try again." };
  const f = fields(fd, type);
  if ("error" in f) return { error: f.error };
  const receipt = await readReceipt(fd);
  if (receipt && "error" in receipt) return { error: receipt.error };
  const res = await recordFund(actor.id, orgId.data, { type, ...f.data, requestId: requestId.data, receipt });
  if (!res.ok) return { error: res.error };
  return { success: `${type === "EXPENSE" ? "Expense" : "Funds"} recorded. It counts once the President approves it.`, id: res.id };
}

async function fundOrg(id: string) {
  return db.fundTransaction.findUnique({ where: { id }, select: { organizationId: true, type: true } });
}

export async function editFundAction(_prev: FundState, fd: FormData): Promise<FundState> {
  const id = uuid.safeParse(fd.get("fundId"));
  if (!id.success) return { error: "Record not found." };
  const t = await fundOrg(id.data);
  if (!t) return { error: "Record not found." };
  const actor = await assertOrgPermission("expenses.record", t.organizationId);
  const f = fields(fd, t.type);
  if ("error" in f) return { error: f.error };
  const receipt = await readReceipt(fd);
  if (receipt && "error" in receipt) return { error: receipt.error };
  const res = await editFund(actor.id, id.data, { ...f.data, receipt });
  return res.ok ? { success: "Saved." } : { error: res.error };
}

export async function cancelFundAction(_prev: FundState, fd: FormData): Promise<FundState> {
  const id = uuid.safeParse(fd.get("fundId"));
  if (!id.success) return { error: "Record not found." };
  const t = await fundOrg(id.data);
  if (!t) return { error: "Record not found." };
  const actor = await assertOrgPermission("expenses.record", t.organizationId);
  const res = await cancelFund(actor.id, id.data, str(fd, "reason"));
  return res.ok ? { success: "Cancelled." } : { error: res.error };
}

export async function decideFundAction(_prev: FundState, fd: FormData): Promise<FundState> {
  const id = uuid.safeParse(fd.get("fundId"));
  if (!id.success) return { error: "Record not found." };
  const t = await fundOrg(id.data);
  if (!t) return { error: "Record not found." };
  const actor = await assertOrgPermission("expenses.approve", t.organizationId);
  const approve = str(fd, "decision") === "approve";
  const res = await decideFund(actor.id, id.data, approve, str(fd, "reason") || null);
  return res.ok ? { success: approve ? `Approved. Available balance is now ₱${res.available}.` : "Rejected." } : { error: res.error };
}

export async function reverseFundAction(_prev: FundState, fd: FormData): Promise<FundState> {
  const id = uuid.safeParse(fd.get("fundId"));
  if (!id.success) return { error: "Record not found." };
  const t = await fundOrg(id.data);
  if (!t) return { error: "Record not found." };
  const actor = await assertOrgPermission("expenses.approve", t.organizationId);
  const res = await reverseFund(actor.id, id.data, str(fd, "reason"));
  return res.ok ? { success: `Reversed. Available balance is now ₱${res.available}.` } : { error: res.error };
}
