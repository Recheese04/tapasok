import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { getActiveTerm } from "@/features/academic/service";
import { userWhereForTargets } from "@/features/attendance/eligibility";
import { notify } from "@/features/notifications/service";

export type AnnouncementTargetInput = { collegeId: string | null; departmentId: string | null; programId: string | null; yearLevel: number | null };

/** Users who should receive an announcement: active members of the organization matching its audience. */
export async function recipientIds(announcementId: string): Promise<string[]> {
  const a = await db.announcement.findUniqueOrThrow({ where: { id: announcementId }, include: { targets: true } });
  const base: Prisma.UserWhereInput = { status: { not: "DISABLED" }, memberships: { some: { organizationId: a.organizationId, endedAt: null } } };
  if (a.targetMode === "ALL_MEMBERS") return (await db.user.findMany({ where: base, select: { id: true } })).map((u) => u.id);

  const semesterId = a.semesterId ?? (await getActiveTerm())?.semester.id;
  const matching = semesterId && a.targets.length ? (await db.user.findMany({ where: { AND: [base, userWhereForTargets(a.targets, semesterId)] }, select: { id: true } })).map((u) => u.id) : [];
  // Officers who oversee the organization (and its adviser) always receive it.
  const overseers = (await db.user.findMany({ where: { status: { not: "DISABLED" }, memberships: { some: { organizationId: a.organizationId, endedAt: null, role: { in: ["PRESIDENT", "SECRETARY", "ADVISER"] } } } }, select: { id: true } })).map((u) => u.id);
  return [...new Set([...matching, ...overseers])];
}

/** Whether a given student matches an announcement's audience (used for visibility). */
export async function audienceMatches(announcement: { id: string; targetMode: "ALL_MEMBERS" | "FILTERED"; semesterId: string | null; organizationId: string }, userId: string, isOverseer: boolean) {
  if (announcement.targetMode === "ALL_MEMBERS" || isOverseer) return true;
  return (await recipientIds(announcement.id)).includes(userId);
}

export async function publishNotifications(announcementId: string, authorId: string) {
  const a = await db.announcement.findUniqueOrThrow({ where: { id: announcementId }, select: { title: true, organization: { select: { name: true } } } });
  const ids = (await recipientIds(announcementId)).filter((id) => id !== authorId);
  await notify(ids, { kind: "announcement", title: `New announcement: ${a.title}`, body: a.organization.name, href: "/announcements" });
}
