import type { AuthUser } from "@/lib/auth/dal";
import type { OrganizationRole } from "@/generated/prisma/enums";

export const ROLE_LABEL: Record<OrganizationRole, string> = {
  PRESIDENT: "President",
  SECRETARY: "Secretary",
  TREASURER: "Treasurer",
  AUDITOR: "Auditor",
  OFFICER: "Officer",
  ADVISER: "Adviser",
  MEMBER: "Member",
};

/** Positions a president may assign. President and Adviser are assigned by a system admin. */
export const PRESIDENT_ASSIGNABLE: OrganizationRole[] = ["SECRETARY", "TREASURER", "AUDITOR", "OFFICER", "MEMBER"];
export const ADMIN_ONLY_ROLES: OrganizationRole[] = ["PRESIDENT", "ADVISER"];

export function userRoleLabel(user: AuthUser): string {
  if (user.systemRole === "SYSTEM_ADMIN") return "System admin";
  const first = user.memberships[0];
  if (!first) return "No organization yet";
  const label = first.title ?? ROLE_LABEL[first.role];
  const extra = user.memberships.length > 1 ? ` (+${user.memberships.length - 1} more)` : "";
  return `${label} · ${first.organizationName}${extra}`;
}
