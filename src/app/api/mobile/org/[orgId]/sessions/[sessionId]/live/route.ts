import { z } from "zod";
import { fail, json } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";
import { liveSession } from "@/features/attendance/live";

/** Live attendance for one session of the organization (attendance.view_org). Polled by the app's live monitor. */
export const GET = orgAuthed<{ params: Promise<{ orgId: string; sessionId: string }> }>("attendance.view_org", async (user, _request, orgId, ctx) => {
  const { sessionId } = await ctx.params;
  if (!z.uuid().safeParse(sessionId).success) return fail(404, "NOT_FOUND", "Session not found.");
  const data = await liveSession(user, sessionId);
  if (!data || data.event.organizationId !== orgId) return fail(404, "NOT_FOUND", "Session not found.");
  return json(data);
});
