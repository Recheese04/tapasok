import { z } from "zod";
import { authed, fail, json } from "@/lib/mobile/api";
import { listNotifications, markAllRead, markRead } from "@/features/notifications/service";

export const GET = authed(async (user) => {
  const rows = await listNotifications(user.id);
  return json({ notifications: rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, at: n.createdAt.toISOString(), read: !!n.readAt })) });
});

const body = z.union([z.object({ action: z.literal("read_all") }), z.object({ action: z.literal("read"), id: z.uuid() })]);

export const POST = authed(async (user, request) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "BAD_REQUEST", "Invalid request.");
  if (parsed.data.action === "read_all") await markAllRead(user.id);
  else await markRead(user.id, parsed.data.id);
  return json({ ok: true });
});
