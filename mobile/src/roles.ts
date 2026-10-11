import type { Caps, OrgOverview } from "./api/types";
import type { Membership } from "./api/types";

/** Order in which a position decides what leads a person's dashboard when they hold several in one organization. */
const PRIORITY = ["PRESIDENT", "TREASURER", "SECRETARY", "AUDITOR", "ADVISER", "OFFICER", "MEMBER"] as const;
export type Role = (typeof PRIORITY)[number];

export function primaryRole(roles: { role: string }[]): Role {
  return PRIORITY.find((r) => roles.some((x) => x.role === r)) ?? "MEMBER";
}

export type OrgRef = { id: string; name: string; acronym: string | null; roles: { role: string; title: string | null }[] };

/** The user's organizations (one entry each), with every position they hold there. */
export function organizationsOf(memberships: Membership[]): OrgRef[] {
  const map = new Map<string, OrgRef>();
  for (const m of memberships) {
    const o = map.get(m.organizationId) ?? { id: m.organizationId, name: m.organization, acronym: m.acronym, roles: [] };
    o.roles.push({ role: m.role, title: m.title });
    map.set(m.organizationId, o);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** True when the position gives access to anything beyond the standard member features. Mirrors the server's capability table. */
export const hasTools = (caps: Caps | undefined) => !!caps && Object.values(caps).some(Boolean);

export type Tool = { key: string; label: string; sub: string; icon: string; tone: "blue" | "success" | "warning" | "violet" | "teal" | "orange"; route: string; badge?: number };

/** The organization tools a position can open, in the order that suits it. Each needs a capability the server also enforces. */
export function toolsFor(o: OrgOverview): Tool[] {
  const c = o.capabilities;
  const role = primaryRole(o.roles);
  const t: Tool[] = [];
  if (c["fees.view_org"]) t.push({ key: "finance", label: "Finance", sub: c["fees.manage"] ? "Verify payments, record cash, balances" : "Read-only summaries and records", icon: "wallet", tone: "orange", route: "/manage/finance", badge: c["fees.manage"] ? (o.finance?.pendingCount ?? 0) : 0 });
  if (c["events.manage"]) t.push({ key: "events", label: "Manage events", sub: "Create, publish and open check-in", icon: "calendar", tone: "violet", route: "/manage/events", badge: o.events.drafts ?? 0 });
  if (c["announcements.manage"]) t.push({ key: "announcements", label: "Announcements", sub: "Post updates to members", icon: "megaphone", tone: "teal", route: "/manage/announcements" });
  if (c["members.basic"]) t.push({ key: "members", label: "Members", sub: `${o.members?.count ?? 0} in this organization`, icon: "people", tone: "blue", route: "/manage/members", badge: o.members?.pendingJoinRequests ?? 0 });
  if (c["documents.manage"]) t.push({ key: "documents", label: "Documents", sub: "Organization records", icon: "document-text", tone: "success", route: "/manage/documents" });
  // Leading tool follows the position: finance for the Treasurer/Auditor, records for the Secretary, events for officers.
  const lead: Record<Role, string> = { PRESIDENT: "events", TREASURER: "finance", AUDITOR: "finance", SECRETARY: "announcements", ADVISER: "members", OFFICER: "events", MEMBER: "" };
  return t.sort((a, b) => Number(b.key === lead[role]) - Number(a.key === lead[role]));
}
