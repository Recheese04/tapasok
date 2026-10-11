import { z } from "zod";
import { db } from "@/lib/database/client";
import { fail, json } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";

const body = z.object({ status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]) });

/** Publish, unpublish or cancel an event (events.manage). Same rules as the web: an event with attendance cannot return to draft. */
export const POST = orgAuthed<{ params: Promise<{ orgId: string; id: string }> }>("events.manage", async (user, request, orgId, ctx) => {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success) return fail(400, "BAD_REQUEST", "Invalid request.");
  const event = await db.event.findFirst({ where: { id, organizationId: orgId }, select: { _count: { select: { attendance: true } } } });
  if (!event) return fail(404, "NOT_FOUND", "Event not found.");
  const status = parsed.data.status;
  if (status === "DRAFT" && event._count.attendance > 0) return fail(409, "REJECTED", "Attendance was already recorded, so this event can only be cancelled.");
  await db.event.update({ where: { id }, data: { status } });
  if (status !== "PUBLISHED") await db.eventSession.updateMany({ where: { eventId: id, finalizedAt: null }, data: { active: false } });
  await db.auditLog.create({ data: { actorUserId: user.id, action: `event.${status.toLowerCase()}`, targetType: "event", targetId: id, metadata: { via: "mobile" } } });
  return json({ ok: true });
});
