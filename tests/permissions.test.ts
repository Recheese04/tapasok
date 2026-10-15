import { describe, expect, it } from "vitest";
import { canOrg, canSystem, orgIdsWith, ORG_POLICY, type OrgPermission } from "@/lib/permissions/policy";
import { navItemsFor } from "@/config/navigation";
import { getOrganizationForViewer } from "@/features/organizations/queries";
import { addMembership } from "./helpers/db";
import { auth, makeWorld, ROLES } from "./helpers/world";

// Expected matrix, written independently of the policy table so a mistaken edit to either is caught.
const ALL_ROLES = ROLES;
const EXPECT: Record<OrgPermission, readonly (typeof ROLES)[number][]> = {
  "org.view": ALL_ROLES,
  "members.roster": ["PRESIDENT", "SECRETARY", "ADVISER"],
  "members.basic": ["PRESIDENT", "SECRETARY", "ADVISER", "OFFICER", "TREASURER", "AUDITOR"],
  "events.view": ALL_ROLES,
  "announcements.view": ALL_ROLES,
  "documents.view": ALL_ROLES,
  "attendance.view_org": ["PRESIDENT", "SECRETARY", "OFFICER", "ADVISER"],
  "consequences.view_org": ["PRESIDENT", "SECRETARY", "OFFICER", "ADVISER"],
  "evaluations.results": ["PRESIDENT", "SECRETARY", "OFFICER", "ADVISER"],
  "fees.view_org": ["PRESIDENT", "TREASURER", "AUDITOR", "ADVISER"],
  "obligations.view_org": ["PRESIDENT", "SECRETARY", "OFFICER", "ADVISER"],
  "documents.audit": ["PRESIDENT", "ADVISER"],
  "members.manage": ["PRESIDENT"],
  "joincode.manage": ["PRESIDENT"],
  "joinrequests.review": ["PRESIDENT", "SECRETARY"],
  "officers.designate": ["PRESIDENT", "ADVISER"],
  "events.manage": ["PRESIDENT", "SECRETARY", "OFFICER"],
  "attendance.scan": ["PRESIDENT", "SECRETARY", "OFFICER"],
  "attendance.manual": ["PRESIDENT", "SECRETARY"],
  "attendance.excuse": ["PRESIDENT", "SECRETARY"],
  "devices.manage": ["PRESIDENT", "SECRETARY"],
  "announcements.manage": ["PRESIDENT", "SECRETARY"],
  "documents.manage": ["PRESIDENT", "SECRETARY"],
  "consequences.rules": ["PRESIDENT", "SECRETARY"],
  "consequences.manage": ["PRESIDENT"],
  "consequences.waive": ["PRESIDENT"],
  "evaluations.manage": ["PRESIDENT", "SECRETARY", "OFFICER"],
  "fees.manage": ["PRESIDENT", "TREASURER"],
  "expenses.record": ["TREASURER"],
  "expenses.approve": ["PRESIDENT"],
  "obligations.manage": ["PRESIDENT", "SECRETARY", "OFFICER"],
  "reports.attendance": ["PRESIDENT", "SECRETARY", "OFFICER", "ADVISER"],
  "reports.consequences": ["PRESIDENT", "ADVISER"],
  "reports.finance": ["PRESIDENT", "TREASURER", "AUDITOR", "ADVISER"],
};

describe("permission policy", () => {
  it("matches the approved matrix for every role and permission, inside the right organization only", async () => {
    const w = await makeWorld();
    for (const role of ROLES) {
      const u = await auth(w.a[role].id);
      for (const perm of Object.keys(ORG_POLICY) as OrgPermission[]) {
        expect(canOrg(u, perm, w.orgA.id), `${role} ${perm} in A`).toBe(EXPECT[perm].includes(role));
        expect(canOrg(u, perm, w.orgB.id), `${role} ${perm} in B (other organization)`).toBe(false);
      }
    }
  });

  it("gives system admins no implicit access to organization modules", async () => {
    const w = await makeWorld();
    const admin = await auth(w.admin.id);
    for (const perm of Object.keys(ORG_POLICY) as OrgPermission[]) {
      expect(canOrg(admin, perm, w.orgA.id), perm).toBe(false);
      expect(orgIdsWith(admin, perm)).toEqual([]);
    }
    for (const p of ["users.manage", "students.manage", "organizations.manage", "settings.system", "reports.system", "academic.manage"] as const) {
      expect(canSystem(admin, p)).toBe(true);
    }
  });

  it("gives no system permission to anyone holding an organization role, even president", async () => {
    const w = await makeWorld();
    for (const role of ROLES) {
      const u = await auth(w.a[role].id);
      for (const p of ["users.manage", "students.manage", "organizations.manage", "settings.system", "reports.system", "academic.manage"] as const) {
        expect(canSystem(u, p), `${role} ${p}`).toBe(false);
      }
    }
  });

  it("applies roles per organization for a user holding different roles in two organizations", async () => {
    const w = await makeWorld();
    // MemberB is a member of B; make them treasurer of A as well.
    const { addMembership } = await import("./helpers/db");
    await addMembership(w.memberB.id, w.orgA.id, "TREASURER");
    const u = await auth(w.memberB.id);
    expect(canOrg(u, "fees.manage", w.orgA.id)).toBe(true);
    expect(canOrg(u, "fees.manage", w.orgB.id)).toBe(false);
    expect(canOrg(u, "events.manage", w.orgA.id)).toBe(false);
    expect(orgIdsWith(u, "org.view").sort()).toEqual([w.orgA.id, w.orgB.id].sort());
  });
});

describe("navigation per role", () => {
  const items = async (id: string) => navItemsFor(await auth(id));
  const labels = async (id: string) => (await items(id)).map((i) => i.label);
  const inSection = async (id: string, section: string) => (await items(id)).filter((i) => i.section === section).map((i) => i.label);
  const REMOVED = ["My QR Code", "Officer Scanner", "Clearance", "My Records", "Join Organization"];

  it("never lists the same destination twice, for any kind of user", async () => {
    const w = await makeWorld();
    await addMembership(w.memberB.id, w.orgA.id, "OFFICER");
    for (const id of [w.admin.id, w.nobody.id, w.memberB.id, w.presidentB.id, ...ROLES.map((r) => w.a[r].id)]) {
      const hrefs = (await items(id)).map((i) => i.href);
      expect(new Set(hrefs).size, `duplicate link for ${id}`).toBe(hrefs.length);
    }
  });

  it("system admin sees only system tools, with no personal organization or management items", async () => {
    const w = await makeWorld();
    expect(await labels(w.admin.id)).toEqual(["Dashboard", "Notifications", "User Management", "Academic Setup", "Organizations", "Reports", "Profile & Settings"]);
  });

  it("regular members get My Account and Other, and no Organization Management", async () => {
    const w = await makeWorld();
    expect(await inSection(w.a.MEMBER.id, "manage")).toEqual([]);
    expect(await inSection(w.a.MEMBER.id, "account")).toEqual([
      "Events", "Scan Attendance QR", "My Attendance", "My Obligations", "My Consequences", "My Fees & Payments", "My Organizations", "Profile & Settings",
    ]);
    expect(await inSection(w.a.MEMBER.id, "other")).toEqual(["Announcements", "Documents", "Event Evaluations"]);
    const l = await labels(w.a.MEMBER.id);
    for (const hidden of ["User Management", "Events & QR", "Manage Obligations", "Manage Consequences", "Reports", ...REMOVED]) expect(l).not.toContain(hidden);
  });

  it("officers get Organization Management and keep their personal features", async () => {
    const w = await makeWorld();
    for (const r of ["OFFICER", "PRESIDENT", "SECRETARY"] as const) {
      expect(await inSection(w.a[r].id, "manage"), r).toEqual(expect.arrayContaining(["Events & QR", "Attendance Records", "Manage Obligations", "Manage Consequences"]));
      expect(await inSection(w.a[r].id, "account"), r).toEqual(expect.arrayContaining(["Scan Attendance QR", "My Attendance", "My Obligations", "My Consequences", "My Organizations"]));
    }
    // Only managers see Events & QR; others do not.
    for (const r of ["TREASURER", "AUDITOR", "ADVISER", "MEMBER"] as const) expect(await labels(w.a[r].id), r).not.toContain("Events & QR");
    // The adviser may view obligations, consequences and attendance, but not manage events.
    expect(await inSection(w.a.ADVISER.id, "manage")).toEqual(expect.arrayContaining(["Manage Obligations", "Attendance Records"]));
  });

  it("organization-wide Fees & Payments is for finance positions only; every attendee keeps My Fees & Payments", async () => {
    const w = await makeWorld();
    for (const r of ["PRESIDENT", "TREASURER"] as const) expect(await inSection(w.a[r].id, "manage"), r).toContain("Fees & Payments");
    expect(await inSection(w.a.OFFICER.id, "manage")).not.toContain("Fees & Payments");
    expect(await inSection(w.a.SECRETARY.id, "manage")).not.toContain("Fees & Payments");
    expect(await inSection(w.a.MEMBER.id, "manage")).not.toContain("Fees & Payments");
    // the Adviser (read-only, not an attendee, not assessed fees) has no personal fees page
    for (const r of ROLES.filter((x) => x !== "ADVISER")) expect(await inSection(w.a[r].id, "account"), r).toContain("My Fees & Payments");
    expect(await inSection(w.a.ADVISER.id, "account")).not.toContain("My Fees & Payments");
  });

  it("an officer in one organization who is only a member in another has both, scoped per organization", async () => {
    const w = await makeWorld();
    await addMembership(w.memberB.id, w.orgA.id, "OFFICER");
    expect(await inSection(w.memberB.id, "manage")).toContain("Events & QR");
    expect(await inSection(w.memberB.id, "account")).toContain("Scan Attendance QR");
    const u = await auth(w.memberB.id);
    expect(canOrg(u, "events.manage", w.orgA.id)).toBe(true);
    expect(canOrg(u, "events.manage", w.orgB.id)).toBe(false);
    expect(canOrg(u, "documents.manage", w.orgB.id)).toBe(false);
  });

  it("removed features are absent for everyone", async () => {
    const w = await makeWorld();
    for (const id of [w.admin.id, w.a.PRESIDENT.id, w.a.OFFICER.id, w.a.MEMBER.id, w.nobody.id]) for (const gone of REMOVED) expect(await labels(id)).not.toContain(gone);
  });

  it("a user with no organization sees only the basics and My Organizations (where they can join)", async () => {
    const w = await makeWorld();
    expect(await labels(w.nobody.id)).toEqual(["Dashboard", "Notifications", "My Organizations", "Profile & Settings"]);
  });
});

describe("organization roster visibility", () => {
  it("shows emails to president/adviser/admin, names only to officer/treasurer, nothing to members, nothing across organizations", async () => {
    const w = await makeWorld();
    const view = async (id: string, org = w.orgA.id) => getOrganizationForViewer(await auth(id), org);

    const pres = await view(w.a.PRESIDENT.id);
    expect(pres?.rosterLevel).toBe("full");
    expect(pres?.members[0].user).toHaveProperty("email");

    for (const r of ["OFFICER", "TREASURER"] as const) {
      const v = await view(w.a[r].id);
      expect(v?.rosterLevel).toBe("basic");
      expect(v?.members.length).toBeGreaterThan(0);
      expect(JSON.stringify(v?.members)).not.toContain("@test.local");
    }
    expect((await view(w.a.MEMBER.id))?.members).toEqual([]);
    expect((await view(w.admin.id))?.rosterLevel).toBe("full");
    expect(await view(w.presidentB.id)).toBeNull(); // another organization's president
    expect(await view(w.nobody.id)).toBeNull();
  });
});
