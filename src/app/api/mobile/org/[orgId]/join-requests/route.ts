import { json } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";
import { pendingRequests, recentDecisions } from "@/features/organizations/requests";

/** Pending join requests with the student's details, plus recent decisions (joinrequests.review: President, Secretary). */
export const GET = orgAuthed("joinrequests.review", async (_user, _request, orgId) => {
  const [pending, decided] = await Promise.all([pendingRequests(orgId), recentDecisions(orgId)]);
  return json({
    pending: pending.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    decided: decided.map((d) => ({ ...d, decidedAt: d.decidedAt?.toISOString() ?? null })),
  });
});
