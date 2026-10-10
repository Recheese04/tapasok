"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { assertOrgPermission } from "@/lib/permissions";
import { parseManilaLocal } from "@/lib/format";
import { cancelObligation, completeObligation, createObligations, submitObligation, updateObligation } from "./service";

export type ObligationState = { error?: string; success?: string };

const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max).transform((v) => v || null);

const createSchema = z.object({
  organizationId: uuid,
  userIds: z.array(uuid).min(1, "Choose at least one member.").max(500),
  title: z.string().trim().min(3, "Give the obligation a title.").max(150),
  description: text(2000),
  completionRequirements: text(1000),
  dueAt: z.string().trim().transform((v) => (v ? parseManilaLocal(v) ?? undefined : null)).refine((d) => d !== undefined, "Enter a valid due date."),
  eventId: z.string().trim().transform((v) => v || null).pipe(uuid.nullable()),
});

export async function createObligationAction(_prev: ObligationState, fd: FormData): Promise<ObligationState> {
  // Authorize before parsing anything else from the request.
  const orgId = uuid.safeParse(fd.get("organizationId"));
  if (!orgId.success) return { error: "Choose an organization." };
  const actor = await assertOrgPermission("obligations.manage", orgId.data);
  const parsed = createSchema.safeParse({
    organizationId: orgId.data, userIds: fd.getAll("userIds").map(String), title: fd.get("title") ?? "", description: fd.get("description") ?? "",
    completionRequirements: fd.get("completionRequirements") ?? "", dueAt: fd.get("dueAt") ?? "", eventId: fd.get("eventId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const res = await createObligations(actor, parsed.data);
  return res.ok ? { success: `Assigned to ${res.count} member${res.count === 1 ? "" : "s"}.` } : { error: res.error };
}

export async function submitObligationAction(_prev: ObligationState, fd: FormData): Promise<ObligationState> {
  const user = await requireUser();
  const id = uuid.safeParse(fd.get("obligationId"));
  if (!id.success) return { error: "Obligation not found." };
  const note = text(1000).safeParse(fd.get("note") ?? "");
  if (!note.success) return { error: "That note is too long." };
  const res = await submitObligation(user.id, id.data, note.data);
  return res.ok ? { success: "Submitted. An officer will verify it." } : { error: res.error };
}

async function officerAction(fd: FormData, run: typeof completeObligation) {
  const user = await requireUser();
  const id = uuid.safeParse(fd.get("obligationId"));
  if (!id.success) return;
  const note = text(1000).safeParse(fd.get("note") ?? "");
  await run(user, id.data, note.success ? note.data : null);
}

export async function completeObligationAction(fd: FormData) { await officerAction(fd, completeObligation); }
export async function cancelObligationAction(fd: FormData) { await officerAction(fd, cancelObligation); }

const editSchema = z.object({
  obligationId: uuid,
  title: z.string().trim().min(3, "Give the obligation a title.").max(150),
  description: text(2000),
  completionRequirements: text(1000),
  dueAt: createSchema.shape.dueAt,
});

export async function updateObligationAction(_prev: ObligationState, fd: FormData): Promise<ObligationState> {
  const user = await requireUser();
  const parsed = editSchema.safeParse({
    obligationId: fd.get("obligationId"), title: fd.get("title") ?? "", description: fd.get("description") ?? "",
    completionRequirements: fd.get("completionRequirements") ?? "", dueAt: fd.get("dueAt") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { obligationId, ...data } = parsed.data;
  const res = await updateObligation(user, obligationId, { ...data, dueAt: data.dueAt ?? null });
  return res.ok ? { success: "Saved." } : { error: res.error };
}
