import "server-only";
import { db } from "@/lib/database/client";
import { canOrg, orgIdsWith } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/dal";
import { PAGE_SIZE } from "@/components/shared/pagination";

/** Where-clause for events this user may see: published events of their organizations, plus drafts where they manage events. */
function visibleEvents(user: AuthUser) {
  const viewIds = orgIdsWith(user, "events.view");
  const manageIds = orgIdsWith(user, "events.manage");
  return {
    organizationId: { in: viewIds },
    OR: [{ status: { in: ["PUBLISHED", "CANCELLED"] as ("PUBLISHED" | "CANCELLED")[] } }, { organizationId: { in: manageIds } }],
  };
}

export async function listEvents(user: AuthUser, opts: { when: "upcoming" | "past"; page: number }) {
  const now = new Date();
  const where = {
    ...visibleEvents(user),
    endsAt: opts.when === "upcoming" ? { gte: now } : { lt: now },
  };
  const [total, rows] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where,
      orderBy: { startsAt: opts.when === "upcoming" ? "asc" : "desc" },
      skip: (opts.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { organization: { select: { name: true } } },
    }),
  ]);
  return { total, rows };
}

/** Null when the event doesn't exist or the user may not see it (indistinguishable). */
export async function getEventForViewer(user: AuthUser, id: string) {
  const event = await db.event.findFirst({
    where: { id, ...visibleEvents(user) },
    include: {
      organization: { select: { name: true } }, evaluation: { select: { id: true, status: true } },
      sessions: { orderBy: { position: "asc" } }, targets: true, rules: { select: { ruleId: true } }, semester: { select: { name: true, schoolYear: { select: { label: true } } } },
    },
  });
  if (!event) return null;
  const canSeeCounts = canOrg(user, "attendance.view_org", event.organizationId);
  const attendanceCount = canSeeCounts ? await db.attendanceRecord.count({ where: { eventId: id } }) : null;
  const myRecords = await db.attendanceRecord.findMany({ where: { eventId: id, userId: user.id }, select: { sessionId: true, status: true, scannedAt: true } });
  // createdById is a plain column (no relation) so old events without a creator keep working.
  const creator = event.createdById ? await db.user.findUnique({ where: { id: event.createdById }, select: { firstName: true, lastName: true } }) : null;
  return { event, attendanceCount, myRecords, creatorName: creator ? `${creator.firstName} ${creator.lastName}` : null };
}
