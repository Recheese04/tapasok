import { z } from "zod";
import { db } from "@/lib/database/client";
import { fail, json } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";
import { decideJoinRequest } from "@/features/organizations/requests";

const body = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().max(300).optional() });

/** Approves or rejects a request (joinrequests.review). The request must belong to the organization in the URL. */
export const POST = orgAuthed<{ params: Promise<{ orgId: string; id: string }> }>("joinrequests.review", async (user, request, orgId, ctx) => {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success) return fail(400, "BAD_REQUEST", "Invalid request.");
  const req = await db.joinRequest.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
  if (!req) return fail(404, "NOT_FOUND", "Request not found.");
  const res = await decideJoinRequest(user.id, id, parsed.data.decision === "approve", parsed.data.note || null);
  return res.ok ? json({ ok: true }) : fail(409, "REJECTED", res.error);
});
