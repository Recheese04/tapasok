import { db } from "@/lib/database/client";
import { authed, json } from "@/lib/mobile/api";
import { memberAnnouncements, memberFees, money } from "@/lib/mobile/queries";
import { Prisma } from "@/generated/prisma/client";
import { memberSessions } from "@/features/attendance/queries";
import { listEvents } from "@/features/events/queries";
import { unreadCount } from "@/features/notifications/service";

/** Everything the Home screen shows, in one request. Each part is scoped to the signed-in member. */
export const GET = authed(async (user) => {
  const [events, announcements, unread, groups, sessions, fees] = await Promise.all([
    listEvents(user, { when: "upcoming", page: 1 }),
    memberAnnouncements(user, 3),
    unreadCount(user.id),
    db.attendanceRecord.groupBy({ by: ["status"], where: { userId: user.id }, _count: { _all: true } }),
    memberSessions(user),
    memberFees(user),
  ]);
  const attendance = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 } as Record<string, number>;
  for (const g of groups) attendance[g.status] = g._count._all;
  const balanceDue = fees.reduce((s, f) => s.add(new Prisma.Decimal(f.balance).gt(0) ? f.balance : 0), new Prisma.Decimal(0));
  return json({
    firstName: user.firstName,
    unread,
    nextEvents: events.rows.filter((e) => e.status === "PUBLISHED").slice(0, 3).map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(), venue: e.venue, organization: e.organization.name })),
    openSessions: sessions.filter((s) => s.state === "open").slice(0, 3).map((s) => ({ id: s.id, label: s.label, eventTitle: s.event.title, organization: s.event.organization })),
    announcements,
    attendance,
    balanceDue: money(balanceDue),
  });
});
