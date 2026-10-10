import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { getActiveTerm } from "@/features/academic/service";

// Who is EXPECTED to attend an event. Absences are only ever created for these people.
// Advisers (faculty/staff) are not student attendees. Filtered events match students through their
// enrollment in the event's semester (or the active semester when the event has none).

type EventForTargets = { id: string; organizationId: string; targetMode: "ALL_MEMBERS" | "FILTERED"; semesterId: string | null };

/** Prisma filter matching users whose enrollment in `semesterId` fits ANY of the target rows (all filled fields must match). */
export function userWhereForTargets(rows: { collegeId: string | null; departmentId: string | null; programId: string | null; yearLevel: number | null }[], semesterId: string): Prisma.UserWhereInput {
  return {
    OR: rows.map((t) => ({
      enrollments: {
        some: {
          semesterId,
          ...(t.yearLevel ? { yearLevel: t.yearLevel } : {}),
          program: {
            ...(t.programId ? { id: t.programId } : {}),
            ...(t.departmentId ? { departmentId: t.departmentId } : {}),
            ...(t.collegeId ? { department: { collegeId: t.collegeId } } : {}),
          },
        },
      },
    })),
  };
}

async function targetFilter(event: EventForTargets): Promise<Prisma.UserWhereInput | null> {
  if (event.targetMode === "ALL_MEMBERS") return {};
  const rows = await db.eventTarget.findMany({ where: { eventId: event.id } });
  if (rows.length === 0) return null; // filtered with no rows: nobody is targeted
  const semesterId = event.semesterId ?? (await getActiveTerm())?.semester.id;
  if (!semesterId) return null;
  return userWhereForTargets(rows, semesterId);
}

function baseMemberWhere(organizationId: string): Prisma.UserWhereInput {
  return {
    status: { not: "DISABLED" },
    memberships: { some: { organizationId, endedAt: null, role: { not: "ADVISER" } } },
  };
}

/** Users expected at the event (active student members who match its targets). */
export async function expectedAttendeeIds(event: EventForTargets): Promise<string[]> {
  const filter = await targetFilter(event);
  if (!filter) return [];
  const users = await db.user.findMany({ where: { AND: [baseMemberWhere(event.organizationId), filter] }, select: { id: true } });
  return users.map((u) => u.id);
}

export async function isExpectedAttendee(event: EventForTargets, userId: string): Promise<boolean> {
  const filter = await targetFilter(event);
  if (!filter) return false;
  return (await db.user.count({ where: { id: userId, AND: [baseMemberWhere(event.organizationId), filter] } })) > 0;
}
