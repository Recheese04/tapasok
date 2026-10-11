import { z } from "zod";
import { authed, fail, json } from "@/lib/mobile/api";
import { MESSAGES, selfCheckIn } from "@/features/attendance/service";

const body = z.object({ code: z.string().min(20).max(500), sessionId: z.uuid().optional() });

/**
 * Check in by scanning the organizer's session QR code. The identity is always the signed-in member; the code, the
 * selected session, its status and window, revocation, eligibility and duplicates are all checked by the same service the
 * web scanner uses. Nothing about location is read.
 */
export const POST = authed(async (user, request) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "BAD_REQUEST", MESSAGES.invalid);
  const res = await selfCheckIn(user.id, parsed.data.code, { selectedSessionId: parsed.data.sessionId });
  if (res.ok) return json({ ok: true, status: res.status, at: res.at.toISOString() });
  return json({ ok: false, reason: res.reason, message: MESSAGES[res.reason] });
});
