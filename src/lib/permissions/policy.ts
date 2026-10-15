// The Tapasok permission policy: one table of CAPABILITIES, least-privilege defaults, no I/O.
// Positions (President, Secretary, Treasurer, Auditor, Officer, Adviser, Member) are bundles of capabilities;
// code always checks the capability, never a position's display name.
// Organization roles apply only inside the organization where they are held, and System Admin is a
// separate system-level flag with NO implicit access to organization modules.
// The Adviser is READ-ONLY with ONE exception: it may designate officers (officers.designate). It appears only in viewing and
// report capabilities and in officers.designate, never in any other capability that changes data.
import type { OrganizationRole, SystemRole } from "@/generated/prisma/enums";

export type PolicyUser = {
  systemRole: SystemRole;
  memberships: { organizationId: string; role: OrganizationRole }[];
};

const ALL: OrganizationRole[] = ["PRESIDENT", "SECRETARY", "TREASURER", "AUDITOR", "OFFICER", "ADVISER", "MEMBER"];

export const ORG_POLICY = {
  // Reading
  "org.view": ALL,
  "members.roster": ["PRESIDENT", "SECRETARY", "ADVISER"], // names + emails
  "members.basic": ["PRESIDENT", "SECRETARY", "ADVISER", "OFFICER", "TREASURER", "AUDITOR"], // names + student numbers
  "events.view": ALL,
  "announcements.view": ALL,
  "documents.view": ALL,
  "attendance.view_org": ["PRESIDENT", "SECRETARY", "OFFICER", "ADVISER"],
  "obligations.view_org": ["PRESIDENT", "SECRETARY", "OFFICER", "ADVISER"],
  "consequences.view_org": ["PRESIDENT", "SECRETARY", "OFFICER", "ADVISER"],
  "evaluations.results": ["PRESIDENT", "SECRETARY", "OFFICER", "ADVISER"],
  "fees.view_org": ["PRESIDENT", "TREASURER", "AUDITOR", "ADVISER"],
  "documents.audit": ["PRESIDENT", "ADVISER"],
  // Membership
  "members.manage": ["PRESIDENT"],
  "joincode.manage": ["PRESIDENT"],
  "joinrequests.review": ["PRESIDENT", "SECRETARY"],
  // Change an existing member's position among Member, Officer, Secretary, Treasurer and Auditor. Adding or removing members
  // stays with members.manage; President and Adviser positions are assigned by a System Admin only.
  "officers.designate": ["PRESIDENT", "ADVISER"],
  // Events and attendance
  "events.manage": ["PRESIDENT", "SECRETARY", "OFFICER"],
  "attendance.scan": ["PRESIDENT", "SECRETARY", "OFFICER"],
  "attendance.manual": ["PRESIDENT", "SECRETARY"], // manual entry, corrections, finalizing sessions
  "attendance.excuse": ["PRESIDENT", "SECRETARY"],
  "devices.manage": ["PRESIDENT", "SECRETARY"],
  // Announcements and records
  "announcements.manage": ["PRESIDENT", "SECRETARY"],
  "documents.manage": ["PRESIDENT", "SECRETARY"],
  // Obligations, consequences, evaluations, finance
  "obligations.manage": ["PRESIDENT", "SECRETARY", "OFFICER"], // assign, verify completion, cancel
  "consequences.rules": ["PRESIDENT", "SECRETARY"], // create, edit, activate/deactivate and delete consequence rules
  "consequences.manage": ["PRESIDENT"], // record, review and correct consequences
  "consequences.waive": ["PRESIDENT"],
  "evaluations.manage": ["PRESIDENT", "SECRETARY", "OFFICER"],
  "fees.manage": ["PRESIDENT", "TREASURER"], // create fees, assess, record cash, verify digital payments, adjust, void
  // Organization funds (expenses and other money received). Independent approval: the Treasurer records, the President
  // approves, rejects or reverses, and nobody decides on a record they recorded themselves (also a database constraint).
  // Viewing uses fees.view_org, so the Auditor and Adviser can read everything but change nothing.
  "expenses.record": ["TREASURER"],
  "expenses.approve": ["PRESIDENT"],
  // Reports
  "reports.attendance": ["PRESIDENT", "SECRETARY", "OFFICER", "ADVISER"],
  "reports.consequences": ["PRESIDENT", "ADVISER"],
  "reports.finance": ["PRESIDENT", "TREASURER", "AUDITOR", "ADVISER"],
} as const satisfies Record<string, readonly OrganizationRole[]>;

/** Capabilities that only read. Every other capability changes data and must not include the Adviser, except
 *  ADVISER_WRITE_EXCEPTIONS (enforced by tests). */
export const READ_ONLY_CAPABILITIES = [
  "org.view", "members.roster", "members.basic", "events.view", "announcements.view", "documents.view", "attendance.view_org",
  "obligations.view_org", "consequences.view_org", "evaluations.results", "fees.view_org", "documents.audit",
  "reports.attendance", "reports.consequences", "reports.finance",
] as const satisfies readonly (keyof typeof ORG_POLICY)[];

/** The only data-changing capabilities the Adviser holds, approved explicitly. */
export const ADVISER_WRITE_EXCEPTIONS = ["officers.designate"] as const satisfies readonly (keyof typeof ORG_POLICY)[];

/** Positions that officers.designate may set or change (both the current and the new position must be one of these). */
export const DESIGNATABLE_ROLES: OrganizationRole[] = ["MEMBER", "OFFICER", "SECRETARY", "TREASURER", "AUDITOR"];

export type OrgPermission = keyof typeof ORG_POLICY;

export type SystemPermission =
  | "users.manage"
  | "students.manage"
  | "organizations.manage"
  | "academic.manage"
  | "settings.system"
  | "reports.system"
  | "landing.manage"; // landing-page event pictures and feedback moderation

export const isSystemAdminUser = (user: PolicyUser) => user.systemRole === "SYSTEM_ADMIN";

/** System permissions belong to System Admin only. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- all system permissions currently belong to System Admin
export const canSystem = (user: PolicyUser, _permission: SystemPermission) => isSystemAdminUser(user);

/** Organization permission inside one specific organization. No admin bypass. */
export function canOrg(user: PolicyUser, permission: OrgPermission, organizationId: string) {
  const allowed: readonly OrganizationRole[] = ORG_POLICY[permission];
  return user.memberships.some((m) => m.organizationId === organizationId && allowed.includes(m.role));
}

/** Organizations in which the user holds the permission. */
export function orgIdsWith(user: PolicyUser, permission: OrgPermission): string[] {
  const allowed: readonly OrganizationRole[] = ORG_POLICY[permission];
  return [...new Set(user.memberships.filter((m) => allowed.includes(m.role)).map((m) => m.organizationId))];
}

export const canOrgAnywhere = (user: PolicyUser, permission: OrgPermission) => orgIdsWith(user, permission).length > 0;
