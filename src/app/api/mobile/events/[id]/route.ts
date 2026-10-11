import { z } from "zod";
import { authed, fail, json } from "@/lib/mobile/api";
import { getEventForViewer } from "@/features/events/queries";

export const GET = authed<{ params: Promise<{ id: string }> }>(async (user, _request, { params }) => {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail(404, "NOT_FOUND", "Event not found.");
  const data = await getEventForViewer(user, id);
  if (!data || data.event.status === "DRAFT") return fail(404, "NOT_FOUND", "Event not found.");
  const { event, myRecords } = data;
  const mine = new Map(myRecords.map((r) => [r.sessionId, r]));
  const now = new Date();
  return json({
    id: event.id, title: event.title, description: event.description, venue: event.venue, status: event.status, organization: event.organization.name,
    startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(), creator: data.creatorName,
    sessions: event.sessions.map((s) => ({
      id: s.id, label: s.label, kind: s.kind, opensAt: s.opensAt.toISOString(), closesAt: s.closesAt.toISOString(),
      open: event.status === "PUBLISHED" && s.active && !s.finalizedAt && now >= s.opensAt && now <= s.closesAt,
      myStatus: mine.get(s.id)?.status ?? null,
    })),
  });
});
