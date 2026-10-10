import "server-only";
import { redirect } from "next/navigation";
import { requireUser, type AuthUser } from "@/lib/auth/dal";
import type { OrganizationRole } from "@/generated/prisma/enums";

// Provisional rules until the permission matrix is agreed with the project owner.
// System admins pass every check; everyone else is scoped to their active memberships.

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export const isSystemAdmin = (user: AuthUser) => user.systemRole === "SYSTEM_ADMIN";

/** True if the user holds one of `roles` in the given organization (or is a system admin). */
export function hasOrgRole(user: AuthUser, organizationId: string, roles: OrganizationRole[]) {
  if (isSystemAdmin(user)) return true;
  return user.memberships.some((m) => m.organizationId === organizationId && roles.includes(m.role));
}

/** True if the user holds one of `roles` in any organization (or is a system admin). */
export function hasAnyOrgRole(user: AuthUser, roles: OrganizationRole[]) {
  return isSystemAdmin(user) || user.memberships.some((m) => roles.includes(m.role));
}

/** For pages: redirects to the dashboard when the user lacks the role. */
export async function requireAnyOrgRole(roles: OrganizationRole[]) {
  const user = await requireUser();
  if (!hasAnyOrgRole(user, roles)) redirect("/dashboard");
  return user;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function assertOrgRole(organizationId: string, roles: OrganizationRole[]) {
  const user = await requireUser();
  if (!hasOrgRole(user, organizationId, roles)) throw new ForbiddenError();
  return user;
}

export async function assertSystemAdmin() {
  const user = await requireUser();
  if (!isSystemAdmin(user)) throw new ForbiddenError();
  return user;
}

// ---- Policy-based guards (see policy.ts). Use these for all new modules. ----
import {
  canOrg,
  canOrgAnywhere,
  canSystem,
  orgIdsWith,
  type OrgPermission,
  type SystemPermission,
} from "./policy";

export { canOrg, canOrgAnywhere, canSystem, orgIdsWith };
export type { OrgPermission, SystemPermission };

/** Server actions / route handlers: throws unless the user holds `permission` in that organization. */
export async function assertOrgPermission(permission: OrgPermission, organizationId: string) {
  const user = await requireUser();
  if (!canOrg(user, permission, organizationId)) throw new ForbiddenError();
  return user;
}

export async function assertSystemPermission(permission: SystemPermission) {
  const user = await requireUser();
  if (!canSystem(user, permission)) throw new ForbiddenError();
  return user;
}

/** Pages: redirects to the dashboard unless the user holds the permission in at least one organization. */
export async function requireOrgPermissionAnywhere(permission: OrgPermission) {
  const user = await requireUser();
  if (!canOrgAnywhere(user, permission)) redirect("/dashboard");
  return user;
}

export async function requireSystemPermissionPage(permission: SystemPermission) {
  const user = await requireUser();
  if (!canSystem(user, permission)) redirect("/dashboard");
  return user;
}
