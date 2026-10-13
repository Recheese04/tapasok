import { z } from "zod";
import { authed, fail, json } from "@/lib/mobile/api";
import { cancelJoinRequest } from "@/features/organizations/requests";

/** Cancels the caller's own pending request. Someone else's request is "not found". */
export const POST = authed<{ params: Promise<{ id: string }> }>(async (user, _request, ctx) => {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail(404, "NOT_FOUND", "Request not found.");
  const res = await cancelJoinRequest(user.id, id);
  return res.ok ? json({ ok: true }) : fail(404, "NOT_FOUND", res.error);
});
