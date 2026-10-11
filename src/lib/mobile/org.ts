import "server-only";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth/dal";
import { canOrg, type OrgPermission } from "@/lib/permissions";
import { authed, fail } from "./api";

// Organization-scoped mobile routes. The organization comes from the URL, but it is never trusted: the signed-in user must
// hold a membership there, and each route names the exact capability it needs. The same capability table as the web
// (src/lib/permissions/policy.ts) decides, so a changed rule applies to web and mobile together.

/** The capabilities the mobile app adapts its screens to. The app only mirrors these; every route re-checks them. */
export const MOBILE_CAPABILITIES = [
  "members.basic", "members.roster", "joinrequests.review",
  "events.manage", "attendance.view_org", "announcements.manage", "documents.manage",
  "fees.view_org", "fees.manage", "reports.finance", "evaluations.results", "evaluations.manage", "obligations.view_org",
] as const satisfies readonly OrgPermission[];

export function capabilitiesIn(user: AuthUser, organizationId: string) {
  return Object.fromEntries(MOBILE_CAPABILITIES.map((c) => [c, canOrg(user, c, organizationId)])) as Record<(typeof MOBILE_CAPABILITIES)[number], boolean>;
}

type Ctx = { params: Promise<{ orgId: string }> };

/** Wraps a route under /api/mobile/org/[orgId]/...: valid token, member of that organization, and (optionally) a capability. */
export function orgAuthed<C extends Ctx = Ctx>(
  permission: OrgPermission | null,
  handler: (user: AuthUser, request: Request, orgId: string, ctx: C) => Promise<Response>,
) {
  return authed<C>(async (user, request, ctx) => {
    const { orgId } = await ctx.params;
    if (!z.uuid().safeParse(orgId).success) return fail(404, "NOT_FOUND", "Organization not found.");
    if (!user.memberships.some((m) => m.organizationId === orgId)) return fail(403, "FORBIDDEN", "You do not have access to that organization.");
    if (permission && !canOrg(user, permission, orgId)) return fail(403, "FORBIDDEN", "Your position does not allow that.");
    return handler(user, request, orgId, ctx);
  });
}
