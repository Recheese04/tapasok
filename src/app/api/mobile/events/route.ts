import { authed, json } from "@/lib/mobile/api";
import { listEvents } from "@/features/events/queries";

/** Events of the member's organizations. Drafts are never shown on mobile. ?when=upcoming|past&page=1 */
export const GET = authed(async (user, request) => {
  const q = new URL(request.url).searchParams;
  const when = q.get("when") === "past" ? "past" : "upcoming";
  const page = Math.min(Math.max(Number(q.get("page")) || 1, 1), 1000);
  const { total, rows } = await listEvents(user, { when, page });
  return json({
    total, page,
    events: rows.filter((e) => e.status !== "DRAFT").map((e) => ({
      id: e.id, title: e.title, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(), venue: e.venue, status: e.status, organization: e.organization.name,
    })),
  });
});
