import { z } from "zod";
import { db } from "@/lib/database/client";
import { fail, json } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";
import { publishNotifications } from "@/features/announcements/service";

const body = z.object({ status: z.enum(["PUBLISHED", "DRAFT"]) });

/** Publishes a draft or pulls a post back to draft (announcements.manage). Members are notified only on the first publish. */
export const POST = orgAuthed<{ params: Promise<{ orgId: string; id: string }> }>("announcements.manage", async (user, request, orgId, ctx) => {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success) return fail(400, "BAD_REQUEST", "Invalid request.");
  const a = await db.announcement.findFirst({ where: { id, organizationId: orgId }, select: { status: true, publishedAt: true } });
  if (!a) return fail(404, "NOT_FOUND", "Announcement not found.");
  const publish = parsed.data.status === "PUBLISHED";
  const first = publish && a.status !== "PUBLISHED";
  await db.announcement.update({ where: { id }, data: { status: parsed.data.status, publishedAt: publish ? (a.publishedAt ?? new Date()) : null } });
  await db.auditLog.create({ data: { actorUserId: user.id, action: "announcement.update", targetType: "announcement", targetId: id, metadata: { status: parsed.data.status, via: "mobile" } } });
  if (first) await publishNotifications(id, user.id);
  return json({ ok: true });
});
