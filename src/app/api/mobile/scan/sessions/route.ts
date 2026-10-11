import { authed, json } from "@/lib/mobile/api";
import { memberSessions } from "@/features/attendance/queries";

/** Sessions the member is eligible to check in to (the same eligibility the web scanner uses). */
export const GET = authed(async (user) => {
  const sessions = await memberSessions(user);
  return json({
    sessions: sessions.map((s) => ({
      id: s.id, label: s.label, kind: s.kind, state: s.state, myStatus: s.myStatus, opensAt: s.opensAt.toISOString(), closesAt: s.closesAt.toISOString(),
      event: { id: s.event.id, title: s.event.title, venue: s.event.venue, startsAt: s.event.startsAt.toISOString(), endsAt: s.event.endsAt.toISOString(), organization: s.event.organization },
    })),
  });
});
