import { z } from "zod";
import { db } from "@/lib/database/client";
import { fail, json } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";
import { createEvent } from "@/features/events/service";

/** The organization's events with drafts, sessions and attendance counts (events.manage). */
export const GET = orgAuthed("events.manage", async (_user, _request, orgId) => {
  const events = await db.event.findMany({
    where: { organizationId: orgId, deletedAt: null }, orderBy: { startsAt: "desc" }, take: 40,
    select: {
      id: true, title: true, venue: true, status: true, startsAt: true, endsAt: true,
      sessions: { orderBy: { position: "asc" }, select: { id: true, label: true, active: true, finalizedAt: true } },
      _count: { select: { attendance: true } },
    },
  });
  return json({
    events: events.map((e) => ({
      id: e.id, title: e.title, venue: e.venue, status: e.status, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(), checkIns: e._count.attendance,
      sessions: e.sessions.map((s) => ({ id: s.id, label: s.label, active: s.active, finalized: !!s.finalizedAt })),
    })),
  });
});

const body = z.object({
  title: z.string().trim().min(2, "Title is required.").max(150),
  venue: z.string().trim().min(2, "Venue is required.").max(200),
  description: z.string().trim().max(2000).optional(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
});

/**
 * Quick event: title, venue and times, for all members, with one time-in session (opens 30 minutes before the start,
 * 15 minutes grace, closes at the end). Created as a draft; publishing and activating attendance are separate steps. Finer
 * options (audiences, several sessions, consequence rules) stay on the web.
 */
export const POST = orgAuthed("events.manage", async (user, request, orgId) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Check the values and try again.");
  const d = parsed.data;
  const startsAt = new Date(d.startsAt), endsAt = new Date(d.endsAt);
  const res = await createEvent(user.id, orgId, {
    title: d.title, description: d.description || null, venue: d.venue, startsAt, endsAt, semesterId: null,
    targetMode: "ALL_MEMBERS", targets: [], requireEvaluation: false, ruleIds: [],
    sessions: [{ label: "Attendance", kind: "TIME_IN", opensAt: new Date(startsAt.getTime() - 30 * 60_000), startsAt, closesAt: endsAt, graceMinutes: 15 }],
  });
  if (!res.ok) return fail(400, "VALIDATION", res.error ?? Object.values(res.fieldErrors ?? {})[0] ?? "Check the values and try again.");
  return json({ ok: true, id: res.id }, 201);
});
