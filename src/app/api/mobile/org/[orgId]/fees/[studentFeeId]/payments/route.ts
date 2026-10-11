import { z } from "zod";
import { db } from "@/lib/database/client";
import { fail, json } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";
import { parseAmount, recordPayment } from "@/features/fees/service";

const body = z.object({ amount: z.string().trim(), method: z.enum(["CASH", "GCASH", "BANK_TRANSFER", "OTHER"]).default("CASH"), reference: z.string().trim().max(100).optional() });

/** Records a payment received in person (fees.manage). It is confirmed immediately with a receipt code, exactly as on the web. */
export const POST = orgAuthed<{ params: Promise<{ orgId: string; studentFeeId: string }> }>("fees.manage", async (user, request, orgId, ctx) => {
  const { studentFeeId } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  const amount = parsed.success ? parseAmount(parsed.data.amount) : null;
  if (!z.uuid().safeParse(studentFeeId).success || !parsed.success || !amount) return fail(400, "BAD_REQUEST", "Enter an amount like 150 or 150.50.");
  const fee = await db.studentFee.findFirst({ where: { id: studentFeeId, organizationId: orgId }, select: { id: true } });
  if (!fee) return fail(404, "NOT_FOUND", "Assessment not found.");
  const res = await recordPayment(user.id, studentFeeId, { amount, method: parsed.data.method, reference: parsed.data.reference || null });
  return res.ok ? json({ ok: true, receiptCode: res.receiptCode }) : fail(409, "REJECTED", res.error);
});
