import { z } from "zod";
import { db } from "@/lib/database/client";
import { fail, json } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";
import { setSessionActive } from "@/features/attendance/service";

const body = z.object({ active: z.boolean() });

/** Opens or closes check-in for one session (attendance.scan). The service re-checks the permission against the session's real organization. */
export const POST = orgAuthed<{ params: Promise<{ orgId: string; id: string; sessionId: string }> }>("attendance.scan", async (user, request, orgId, ctx) => {
  const { id, sessionId } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(sessionId).success || !z.uuid().safeParse(id).success || !parsed.success) return fail(400, "BAD_REQUEST", "Invalid request.");
  const s = await db.eventSession.findFirst({ where: { id: sessionId, eventId: id, event: { organizationId: orgId } }, select: { id: true } });
  if (!s) return fail(404, "NOT_FOUND", "Session not found.");
  const res = await setSessionActive(user, sessionId, parsed.data.active);
  return res.ok ? json({ ok: true }) : fail(409, "REJECTED", res.error ?? "Could not update the session.");
});
