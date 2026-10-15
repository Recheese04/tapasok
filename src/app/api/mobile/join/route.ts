import { z } from "zod";
import { authed, fail, json } from "@/lib/mobile/api";
import { joinableOrganizations, myRequests, submitJoinRequest } from "@/features/organizations/requests";

/** Organizations the student can ask to join, and their own requests with the decision (pending, approved, rejected). */
export const GET = authed(async (user) => {
  const [orgs, requests] = await Promise.all([joinableOrganizations(user.id), myRequests(user.id)]);
  return json({
    organizations: orgs,
    requests: requests.map((r) => ({
      id: r.id, organization: r.organization.name, status: r.status, message: r.message, note: r.decisionNote,
      createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
    })),
  });
});

const body = z.object({ organizationId: z.uuid(), message: z.string().trim().max(300).optional() });

/** Sends a membership request. Duplicates (a pending request, or already a member) are refused by the same service as the web. */
export const POST = authed(async (user, request) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "BAD_REQUEST", "Choose an organization.");
  const res = await submitJoinRequest(user.id, parsed.data.organizationId, parsed.data.message || null);
  return res.ok ? json({ ok: true }) : fail(409, "REJECTED", res.error);
});
