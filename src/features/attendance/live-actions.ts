"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { liveSession, type LiveData } from "./live";

/** Polled by the live monitor. Returns null when the session is missing or the viewer may not see it. */
export async function liveSessionAction(sessionId: string): Promise<LiveData | null> {
  const user = await requireUser();
  if (!z.uuid().safeParse(sessionId).success) return null;
  return liveSession(user, sessionId);
}
