import "server-only";
import { db } from "@/lib/database/client";

// In-app notifications. (Push delivery is not implemented: it needs a configured and tested provider.)

export type NotificationInput = { kind: string; title: string; body?: string; href?: string };

/** Creates one notification per distinct recipient. Failures never break the action that triggered them. */
export async function notify(userIds: string[], n: NotificationInput): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  try {
    await db.notification.createMany({ data: ids.map((userId) => ({ userId, kind: n.kind, title: n.title.slice(0, 160), body: n.body?.slice(0, 500) ?? null, href: n.href ?? null })) });
  } catch (e) {
    console.error("notification failed", e instanceof Error ? e.message : e);
  }
}

export const unreadCount = (userId: string) => db.notification.count({ where: { userId, readAt: null } });

export function listNotifications(userId: string) {
  return db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markRead(userId: string, id: string) {
  await db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}
