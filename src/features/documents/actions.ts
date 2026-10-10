"use server";

import { z } from "zod";
import { db } from "@/lib/database/client";
import { assertOrgPermission } from "@/lib/permissions";
import { getActiveTerm } from "@/features/academic/service";
import { checkUpload, saveBytes, MAX_UPLOAD_BYTES } from "./storage";

export type DocumentState = { error?: string; success?: string };

export async function uploadDocumentAction(_prev: DocumentState, fd: FormData): Promise<DocumentState> {
  const orgId = z.uuid().safeParse(fd.get("organizationId"));
  if (!orgId.success) return { error: "Choose an organization." };
  const actor = await assertOrgPermission("documents.manage", orgId.data);

  const title = z.string().trim().min(2, "Enter a title.").max(150).safeParse(fd.get("title"));
  if (!title.success) return { error: title.error.issues[0].message };
  const description = (fd.get("description") ?? "").toString().trim().slice(0, 500) || null;
  const category = z.enum(["MINUTES", "ATTENDANCE_SHEET", "RESOLUTION", "EVENT_DOCUMENT", "OTHER"]).safeParse(fd.get("category") || "OTHER");
  if (!category.success) return { error: "Choose a category." };
  const eventId = z.union([z.uuid(), z.literal("")]).safeParse(fd.get("eventId") ?? "");
  if (eventId.success && eventId.data && !(await db.event.findFirst({ where: { id: eventId.data, organizationId: orgId.data }, select: { id: true } }))) return { error: "Choose an event of this organization." };
  const semesterId = (await getActiveTerm())?.semester.id ?? null;
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "The file is larger than 10 MB." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const check = checkUpload(file.name, bytes);
  if (!check.ok) return { error: check.error };

  const storageKey = await saveBytes(bytes);
  const doc = await db.document.create({
    data: { organizationId: orgId.data, title: title.data, description, fileName: file.name.slice(0, 200), mimeType: check.mime, sizeBytes: bytes.length, storageKey, uploadedById: actor.id, category: category.data, semesterId, eventId: eventId.success && eventId.data ? eventId.data : null },
  });
  await db.auditLog.create({ data: { actorUserId: actor.id, action: "document.upload", targetType: "document", targetId: doc.id } });
  return { success: "Document uploaded." };
}

/** Soft delete: the record and file are kept for history but are no longer listed or downloadable. */
export async function removeDocumentAction(fd: FormData) {
  const id = z.uuid().safeParse(fd.get("documentId"));
  if (!id.success) return;
  const doc = await db.document.findUnique({ where: { id: id.data }, select: { organizationId: true, deletedAt: true } });
  if (!doc || doc.deletedAt) return;
  const actor = await assertOrgPermission("documents.manage", doc.organizationId);
  await db.document.update({ where: { id: id.data }, data: { deletedAt: new Date() } });
  await db.auditLog.create({ data: { actorUserId: actor.id, action: "document.remove", targetType: "document", targetId: id.data } });
}

export type DocumentEditState = { error?: string; success?: string };

/** Edits a document's title, description and category. The file itself and its uploader never change. */
export async function updateDocumentAction(_prev: DocumentEditState, fd: FormData): Promise<DocumentEditState> {
  const id = z.uuid().safeParse(fd.get("documentId"));
  if (!id.success) return { error: "Document not found." };
  const doc = await db.document.findUnique({ where: { id: id.data }, select: { organizationId: true, deletedAt: true } });
  if (!doc || doc.deletedAt) return { error: "Document not found." };
  const actor = await assertOrgPermission("documents.manage", doc.organizationId);
  const parsed = z.object({
    title: z.string().trim().min(2, "Enter a title.").max(150),
    description: z.string().trim().max(500).transform((v) => v || null),
    category: z.enum(["MINUTES", "ATTENDANCE_SHEET", "RESOLUTION", "EVENT_DOCUMENT", "OTHER"]),
  }).safeParse({ title: fd.get("title") ?? "", description: fd.get("description") ?? "", category: fd.get("category") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.$transaction([
    db.document.update({ where: { id: id.data }, data: parsed.data }),
    db.auditLog.create({ data: { actorUserId: actor.id, action: "document.update", targetType: "document", targetId: id.data } }),
  ]);
  return { success: "Saved." };
}
