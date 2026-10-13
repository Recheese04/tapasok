import { z } from "zod";
import { authed, fail, json } from "@/lib/mobile/api";
import { joinableOrganizations, joinOrganization, myRequests } from "@/features/organizations/requests";

/** Organizations the student can join (immediately, no approval), and any earlier join requests (history). */
export const GET = authed(async (user) => {
  const [orgs, requests] = await Promise.all([joinableOrganizations(user.id), myRequests(user.id)]);
  return json({
    organizations: orgs.map((o) => ({ id: o.id, name: o.name, acronym: o.acronym, description: o.description, members: o._count.members })),
    requests: requests.map((r) => ({
      id: r.id, organization: r.organization.name, status: r.status, message: r.message, note: r.decisionNote,
      createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
    })),
  });
});

const body = z.object({ organizationId: z.uuid() });

/**
 * Joins the organization right away as a Member. The same service as the web checks the account, the organization and
 * duplicates. (Earlier app versions called this "request to join"; they now join directly too.)
 */
export const POST = authed(async (user, request) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "BAD_REQUEST", "Choose an organization.");
  const res = await joinOrganization(user.id, parsed.data.organizationId);
  return res.ok ? json({ ok: true, joined: true, organization: res.organization }) : fail(409, "REJECTED", res.error);
});
