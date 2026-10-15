import { z } from "zod";
import { db } from "@/lib/database/client";
import { fail, json } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";
import { getActiveTerm } from "@/features/academic/service";
import { publishNotifications } from "@/features/announcements/service";

/** Everything this organization has posted, drafts included (announcements.manage). */
export const GET = orgAuthed("announcements.manage", async (_user, _request, orgId) => {
  const rows = await db.announcement.findMany({
    where: { organizationId: orgId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, title: true, body: true, status: true, publishedAt: true, createdAt: true },
  });
  return json({ announcements: rows.map((a) => ({ id: a.id, title: a.title, body: a.body, status: a.status, at: (a.publishedAt ?? a.createdAt).toISOString() })) });
});

const body = z.object({ title: z.string().trim().min(3, "Title is required.").max(150), body: z.string().trim().min(1, "Write the announcement.").max(5000), publish: z.boolean() });

/** Posts an announcement to every member of the organization (audience filtering stays a web feature). */
export const POST = orgAuthed("announcements.manage", async (user, request, orgId) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Check the values and try again.");
  const { title, body: text, publish } = parsed.data;
  const a = await db.announcement.create({
    data: {
      organizationId: orgId, title, body: text, authorId: user.id, semesterId: (await getActiveTerm())?.semester.id ?? null, targetMode: "ALL_MEMBERS",
      status: publish ? "PUBLISHED" : "DRAFT", publishedAt: publish ? new Date() : null,
    },
  });
  await db.auditLog.create({ data: { actorUserId: user.id, action: "announcement.create", targetType: "announcement", targetId: a.id, metadata: { via: "mobile" } } });
  if (publish) await publishNotifications(a.id, user.id);
  return json({ ok: true, id: a.id }, 201);
});
