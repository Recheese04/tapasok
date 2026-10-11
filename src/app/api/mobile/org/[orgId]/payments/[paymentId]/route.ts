import { z } from "zod";
import { db } from "@/lib/database/client";
import { fail, json } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";
import { verifyPayment } from "@/features/fees/service";

const body = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(300).optional() });

/** Confirms or rejects a pending payment (fees.manage). The payment must belong to the organization in the URL. */
export const POST = orgAuthed<{ params: Promise<{ orgId: string; paymentId: string }> }>("fees.manage", async (user, request, orgId, ctx) => {
  const { paymentId } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(paymentId).success || !parsed.success) return fail(400, "BAD_REQUEST", "Invalid request.");
  const p = await db.payment.findFirst({ where: { id: paymentId, studentFee: { organizationId: orgId } }, select: { id: true } });
  if (!p) return fail(404, "NOT_FOUND", "Payment not found.");
  const res = await verifyPayment(user.id, paymentId, parsed.data.decision === "approve", parsed.data.reason || null);
  return res.ok ? json({ ok: true }) : fail(409, "REJECTED", res.error);
});
