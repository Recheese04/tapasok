"use server";

import { requireUser } from "@/lib/auth/dal";
import { markAllRead } from "./service";

export async function markAllReadAction() {
  const user = await requireUser();
  await markAllRead(user.id);
}
