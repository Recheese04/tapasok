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

/** Reviewer authority comes from the request's own organization, never from the form. */
export async function decideJoinRequestAction(fd: FormData) {
  const id = z.uuid().safeParse(fd.get("requestId"));
  if (!id.success) return;
  const req = await db.joinRequest.findUnique({ where: { id: id.data }, select: { organizationId: true } });
  if (!req) return;
  const reviewer = await assertOrgPermission("joinrequests.review", req.organizationId);
  const note = (fd.get("note") ?? "").toString().trim().slice(0, 300) || null;
  await decideJoinRequest(reviewer.id, id.data, fd.get("decision") === "approve", note);
}
