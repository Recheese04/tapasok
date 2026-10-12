import { z } from "zod";
import { db } from "@/lib/database/client";
import { fail, json } from "@/lib/mobile/api";
import { capabilitiesIn, orgAuthed } from "@/lib/mobile/org";
import { cancelFund, decideFund, reverseFund } from "@/features/finance/funds";

const body = z.object({ action: z.enum(["approve", "reject", "cancel", "reverse"]), reason: z.string().max(500).optional() });

/**
 * Decide on a record: approve / reject / reverse need expenses.approve (President), cancel needs expenses.record and must
 * be the recorder. The record must belong to the organization in the URL; the service enforces status and independence.
 */
export const POST = orgAuthed<{ params: Promise<{ orgId: string; id: string }> }>("fees.view_org", async (user, request, orgId, ctx) => {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success) return fail(400, "BAD_REQUEST", "Invalid request.");
  const t = await db.fundTransaction.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
  if (!t) return fail(404, "NOT_FOUND", "Record not found.");
  const caps = capabilitiesIn(user, orgId);
  const { action } = parsed.data;
  const reason = parsed.data.reason?.trim() ?? "";
  if (action === "cancel" ? !caps["expenses.record"] : !caps["expenses.approve"]) return fail(403, "FORBIDDEN", "Your position does not allow that.");

  const res = action === "cancel" ? await cancelFund(user.id, id, reason)
    : action === "reverse" ? await reverseFund(user.id, id, reason)
      : await decideFund(user.id, id, action === "approve", reason || null);
  return res.ok ? json({ ok: true, ...("available" in res ? { available: res.available } : {}) }) : fail(409, "REJECTED", res.error);
});
