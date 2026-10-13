"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { cancelJoinRequest, joinOrganization } from "./requests";

export type JoinState = { error?: string; success?: string };

/** Joins an interest-based organization immediately, as a Member. */
export async function joinOrganizationAction(_prev: JoinState, fd: FormData): Promise<JoinState> {
  const user = await requireUser();
  const orgId = z.uuid().safeParse(fd.get("organizationId"));
  if (!orgId.success) return { error: "Choose an organization." };
  const res = await joinOrganization(user.id, orgId.data);
  return res.ok ? { success: `You joined ${res.organization}. You are now a member.` } : { error: res.error };
}

/** Withdraws an old pending request (from before joining became immediate). */
export async function cancelJoinRequestAction(fd: FormData) {
  const user = await requireUser();
  const id = z.uuid().safeParse(fd.get("requestId"));
  if (id.success) await cancelJoinRequest(user.id, id.data);
}
