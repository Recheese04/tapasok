import {
  canOrgAnywhere,
  canSystem,
  isSystemAdminUser,
  type OrgPermission,
  type PolicyUser,
} from "@/lib/permissions/policy";

export type NavSection = "general" | "admin" | "manage" | "account" | "other";

/** `also`: other path prefixes that belong to this item (e.g. the finance sub-pages under Fees & Payments). */
export type NavItem = { label: string; href: string; section: NavSection; also?: string[] };

type Rule = NavItem & { visible: (u: PolicyUser) => boolean };

/** Sidebar headings. Sections without a heading render as plain groups. */
export const SECTION_HEADING: Record<NavSection, string | null> = {
  general: null, admin: "Administration", manage: "Organization Management", account: "My Account", other: "Other",
};

const admin = (u: PolicyUser) => isSystemAdminUser(u);
const orgUser = (u: PolicyUser) => !isSystemAdminUser(u); // organization modules are not shown to System Admin
const anyOrg = (u: PolicyUser) => orgUser(u) && u.memberships.length > 0;
// Checking in is for attendees. The Adviser is read-only and never an attendee, so an Adviser-only account has no Scan link
// (the server refuses an adviser's check-in regardless).
const attendee = (u: PolicyUser) => orgUser(u) && u.memberships.some((m) => m.role !== "ADVISER");
const orgPerm = (p: OrgPermission) => (u: PolicyUser) => orgUser(u) && canOrgAnywhere(u, p);
const anyPerm = (...ps: OrgPermission[]) => (u: PolicyUser) => ps.some((p) => orgPerm(p)(u));

// UI visibility only. Every page, query and action enforces the same policy on the server (src/lib/permissions), so a
// hidden link is never the only protection.
//
// "Fees & Payments" (organization-wide) and "My Fees & Payments" (personal) are different pages, as are "Members &
// Organizations" (organizations you help run) and "My Organizations" (your memberships, with joining).
// Management links come from the user's permissions in ANY organization they hold a position in; personal links are
// available to everyone with a membership. So an officer in A who is a plain member in B sees both. Each destination
// appears once: when two rules point at the same page, the first (the management one) wins, and the page itself limits
// what each organization's data shows the person.
const RULES: Rule[] = [
  { label: "Dashboard", href: "/dashboard", section: "general", visible: () => true },
  { label: "Notifications", href: "/notifications", section: "general", visible: () => true },

  { label: "User Management", href: "/users", section: "admin", visible: (u) => canSystem(u, "users.manage") },
  { label: "Academic Setup", href: "/academic", section: "admin", visible: (u) => canSystem(u, "academic.manage") },
  { label: "Organizations", href: "/organizations", section: "admin", visible: admin },
  { label: "Reports", href: "/reports", section: "admin", visible: (u) => canSystem(u, "reports.system") },

  { label: "Events & QR", href: "/events", section: "manage", visible: anyPerm("events.manage", "attendance.scan") },
  { label: "Attendance Records", href: "/attendance/records", section: "manage", visible: orgPerm("attendance.view_org") },
  { label: "Manage Obligations", href: "/obligations/manage", section: "manage", visible: orgPerm("obligations.view_org") },
  { label: "Manage Consequences", href: "/consequences/manage", section: "manage", visible: orgPerm("consequences.view_org") },
  { label: "Members & Organizations", href: "/organizations/manage", section: "manage", visible: orgPerm("members.basic") },
  { label: "Fees & Payments", href: "/fees/manage", also: ["/fees/expenses", "/fees/report", "/fees/audit"], section: "manage", visible: orgPerm("fees.view_org") },

  { label: "Events", href: "/events", section: "account", visible: anyOrg },
  { label: "Scan Attendance QR", href: "/attendance/scan", section: "account", visible: attendee },
  { label: "My Attendance", href: "/attendance", section: "account", visible: anyOrg },
  { label: "My Obligations", href: "/obligations", section: "account", visible: anyOrg },
  { label: "My Consequences", href: "/consequences", section: "account", visible: anyOrg },
  { label: "My Fees & Payments", href: "/fees", section: "account", visible: anyOrg },
  { label: "My Organizations", href: "/organizations", section: "account", visible: orgUser },
  { label: "Profile & Settings", href: "/settings", section: "account", visible: () => true },

  { label: "Announcements", href: "/announcements", section: "other", visible: anyOrg },
  { label: "Documents", href: "/documents", section: "other", visible: anyOrg },
  { label: "Event Evaluations", href: "/evaluations", section: "other", visible: anyOrg },
  {
    label: "Reports",
    href: "/reports",
    section: "other",
    visible: (u) => orgUser(u) && (orgPerm("reports.attendance")(u) || orgPerm("reports.finance")(u) || orgPerm("reports.consequences")(u)),
  },
];

export function navItemsFor(user: PolicyUser): NavItem[] {
  const seen = new Set<string>();
  const out: NavItem[] = [];
  for (const r of RULES) {
    if (!r.visible(user) || seen.has(r.href)) continue;
    seen.add(r.href);
    out.push({ label: r.label, href: r.href, section: r.section, ...(r.also ? { also: r.also } : {}) });
  }
  return out;
}
