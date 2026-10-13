"use server";

import { z } from "zod";
import { db } from "@/lib/database/client";
import { requireUser } from "@/lib/auth/dal";
import { assertOrgPermission } from "@/lib/permissions";
import { cancelJoinRequest, decideJoinRequest, submitJoinRequest } from "./requests";

export type RequestState = { error?: string; success?: string };

export async function submitJoinRequestAction(_prev: RequestState, fd: FormData): Promise<RequestState> {
  const user = await requireUser();
  if (user.systemRole === "SYSTEM_ADMIN") return { error: "System administrators manage organizations instead of joining them." };
  const orgId = z.uuid().safeParse(fd.get("organizationId"));
  if (!orgId.success) return { error: "Choose an organization." };
  const message = (fd.get("message") ?? "").toString().trim().slice(0, 300) || null;
  const res = await submitJoinRequest(user.id, orgId.data, message);
  return res.ok ? { success: "Request sent. An officer will review it." } : { error: res.error };
}

export async function cancelJoinRequestAction(fd: FormData) {
  const user = await requireUser();
  const id = z.uuid().safeParse(fd.get("requestId"));
  if (id.success) await cancelJoinRequest(user.id, id.data);
}

/**
 * Approve or reject. Reviewer authority (joinrequests.review: President, Secretary) comes from the request's own
 * organization, never from the form, so a reviewer in one organization cannot decide another organization's requests.
 */
export async function decideJoinRequestAction(fd: FormData): Promise<RequestState> {
  const id = z.uuid().safeParse(fd.get("requestId"));
  const decision = z.enum(["approve", "reject"]).safeParse(fd.get("decision"));
  if (!id.success || !decision.success) return { error: "Invalid request." };
  const req = await db.joinRequest.findUnique({ where: { id: id.data }, select: { organizationId: true } });
  if (!req) return { error: "Request not found." };
  const reviewer = await assertOrgPermission("joinrequests.review", req.organizationId);
  const note = (fd.get("note") ?? "").toString().trim().slice(0, 300) || null;
  const res = await decideJoinRequest(reviewer.id, id.data, decision.data === "approve", note);
  return res.ok ? { success: decision.data === "approve" ? "Approved. The student is now a member." : "Rejected. The student has been notified." } : { error: res.error };
}
