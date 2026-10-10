"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/database/client";
import { assertOrgPermission } from "@/lib/permissions";
import { fieldErrorsOf } from "@/lib/format";
import { getActiveTerm } from "@/features/academic/service";
import { publishNotifications } from "./service";

export type AnnouncementState = { error?: string; success?: string; fieldErrors?: Record<string, string | undefined> };

const optUuid = z.union([z.uuid(), z.literal("")]).transform((v) => v || null).nullable().optional();
const targetSchema = z.object({ collegeId: optUuid, departmentId: optUuid, programId: optUuid, yearLevel: z.union([z.number().int().min(1).max(10), z.null()]).optional() });

const bodySchema = z.object({
  title: z.string().trim().min(3, "Title is required.").max(150),
  body: z.string().trim().min(1, "Write the announcement.").max(5000),
  intent: z.enum(["save", "publish", "unpublish"]),
  semesterId: optUuid,
  targetMode: z.enum(["ALL_MEMBERS", "FILTERED"]),
  targets: z.string().transform((v, ctx) => { try { return JSON.parse(v || "[]"); } catch { ctx.addIssue({ code: "custom", message: "Invalid audience." }); return z.NEVER; } }).pipe(z.array(targetSchema).max(20)),
});

const read = (fd: FormData) =>
  bodySchema.safeParse({
    title: fd.get("title"), body: fd.get("body"), intent: (fd.get("intent") ?? "save").toString(), semesterId: (fd.get("semesterId") ?? "").toString(),
    targetMode: (fd.get("targetMode") ?? "ALL_MEMBERS").toString(), targets: (fd.get("targets") ?? "[]").toString(),
  });

type Parsed = z.infer<typeof bodySchema>;
const targetRows = (p: Parsed) => (p.targetMode === "FILTERED" ? p.targets.map((t) => ({ collegeId: t.collegeId ?? null, departmentId: t.departmentId ?? null, programId: t.programId ?? null, yearLevel: t.yearLevel ?? null })).filter((t) => t.collegeId || t.departmentId || t.programId || t.yearLevel) : []);

export async function createAnnouncementAction(_prev: AnnouncementState, fd: FormData): Promise<AnnouncementState> {
  const orgId = z.uuid().safeParse(fd.get("organizationId"));
  if (!orgId.success) return { error: "Choose an organization." };
  const actor = await assertOrgPermission("announcements.manage", orgId.data);
  const parsed = read(fd);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const p = parsed.data;
  const rows = targetRows(p);
  if (p.targetMode === "FILTERED" && rows.length === 0) return { fieldErrors: { targets: "Add at least one audience group, or send to everyone." } };

  const publish = p.intent === "publish";
  const semesterId = p.semesterId ?? (await getActiveTerm())?.semester.id ?? null;
  const a = await db.announcement.create({
    data: {
      organizationId: orgId.data, title: p.title, body: p.body, authorId: actor.id, semesterId, targetMode: p.targetMode,
      status: publish ? "PUBLISHED" : "DRAFT", publishedAt: publish ? new Date() : null,
      targets: { create: rows },
    },
  });
  await db.auditLog.create({ data: { actorUserId: actor.id, action: "announcement.create", targetType: "announcement", targetId: a.id } });
  if (publish) await publishNotifications(a.id, actor.id);
  redirect("/announcements");
}

export async function updateAnnouncementAction(_prev: AnnouncementState, fd: FormData): Promise<AnnouncementState> {
  const id = z.uuid().safeParse(fd.get("announcementId"));
  if (!id.success) return { error: "Invalid announcement." };
  const existing = await db.announcement.findUnique({ where: { id: id.data }, select: { organizationId: true, status: true, publishedAt: true } });
  if (!existing) return { error: "Announcement not found." };
  const actor = await assertOrgPermission("announcements.manage", existing.organizationId);
  const parsed = read(fd);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const p = parsed.data;
  const rows = targetRows(p);
  if (p.targetMode === "FILTERED" && rows.length === 0) return { fieldErrors: { targets: "Add at least one audience group, or send to everyone." } };

  const status = p.intent === "publish" ? "PUBLISHED" : p.intent === "unpublish" ? "DRAFT" : existing.status;
  const newlyPublished = status === "PUBLISHED" && existing.status !== "PUBLISHED";
  await db.$transaction([
    db.announcementTarget.deleteMany({ where: { announcementId: id.data } }),
    db.announcement.update({
      where: { id: id.data },
      data: { title: p.title, body: p.body, status, targetMode: p.targetMode, semesterId: p.semesterId ?? undefined, publishedAt: status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : null, targets: { create: rows } },
    }),
    db.auditLog.create({ data: { actorUserId: actor.id, action: "announcement.update", targetType: "announcement", targetId: id.data, metadata: { status } } }),
  ]);
  if (newlyPublished) await publishNotifications(id.data, actor.id);
  return { success: status === "PUBLISHED" ? "Saved and published." : "Saved." };
}

/** Permanently removes an announcement (and its audience targets). Notifications already sent stay in people's inboxes. */
export async function deleteAnnouncementAction(fd: FormData) {
  const id = z.uuid().safeParse(fd.get("announcementId"));
  if (!id.success) return;
  const a = await db.announcement.findUnique({ where: { id: id.data }, select: { organizationId: true } });
  if (!a) return;
  const actor = await assertOrgPermission("announcements.manage", a.organizationId);
  await db.$transaction([
    db.announcementTarget.deleteMany({ where: { announcementId: id.data } }),
    db.announcement.delete({ where: { id: id.data } }),
    db.auditLog.create({ data: { actorUserId: actor.id, action: "announcement.delete", targetType: "announcement", targetId: id.data } }),
  ]);
}
