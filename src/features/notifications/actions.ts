"use server";

import { requireUser } from "@/lib/auth/dal";
import { z } from "zod";
import { clearAllNotifications, clearNotification, markAllRead } from "./service";

export async function markAllReadAction() {
  const user = await requireUser();
  await markAllRead(user.id);
}

/** Removes one of the signed-in person's own notifications (the id is checked against their account). */
export async function clearNotificationAction(fd: FormData) {
  const user = await requireUser();
  const id = z.uuid().safeParse(fd.get("id"));
  if (id.success) await clearNotification(user.id, id.data);
}

export async function clearAllNotificationsAction() {
  const user = await requireUser();
  await clearAllNotifications(user.id);
}
