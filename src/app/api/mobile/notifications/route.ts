import { z } from "zod";
import { authed, fail, json } from "@/lib/mobile/api";
import { clearAllNotifications, clearNotification, listNotifications, markAllRead, markRead } from "@/features/notifications/service";

export const GET = authed(async (user) => {
  const rows = await listNotifications(user.id);
  return json({ notifications: rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, at: n.createdAt.toISOString(), read: !!n.readAt })) });
});

const body = z.union([
  z.object({ action: z.enum(["read_all", "clear_all"]) }),
  z.object({ action: z.enum(["read", "clear"]), id: z.uuid() }),
]);

export const POST = authed(async (user, request) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "BAD_REQUEST", "Invalid request.");
  const p = parsed.data;
  if ("id" in p) await (p.action === "read" ? markRead : clearNotification)(user.id, p.id);
  else await (p.action === "read_all" ? markAllRead : clearAllNotifications)(user.id);
  return json({ ok: true });
});
