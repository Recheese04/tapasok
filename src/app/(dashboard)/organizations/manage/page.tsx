import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { ModalButton } from "@/components/shared/modal";
import { actionButton, Badge, Page, PageHeader } from "@/components/shared/ui";
import { Icon } from "@/components/layout/icons";
import { db } from "@/lib/database/client";
import { canOrg, hasOrgRole, orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { ROLE_LABEL } from "@/features/auth/roles";
import { AddMemberForm } from "@/features/organizations/add-member-form";
import { JoinCodeManager } from "@/features/organizations/join-code-manager";
import { getLatestJoinCode, joinCodeStatus } from "@/features/organizations/join-codes";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const SCOPE = { DEPARTMENTAL: "Departmental", COLLEGE_WIDE: "College-wide", UNIVERSITY_WIDE: "University-wide", CO_CURRICULAR: "Co-curricular" } as const;

/** Members & Organizations: only organizations where the signed-in user holds a roster or member-management position. */
export default async function ManageOrganizationsPage() {
  const user = await requireOrgPermissionAnywhere("members.basic");
  const ids = orgIdsWith(user, "members.basic");
  const orgs = await db.organization.findMany({
    where: { id: { in: ids } }, orderBy: { name: "asc" },
    select: { id: true, name: true, acronym: true, description: true, scope: true, status: true, _count: { select: { members: { where: { endedAt: null } } } } },
  });
  const position = new Map(user.memberships.map((m) => [m.organizationId, m.title ? `${m.title} (${ROLE_LABEL[m.role]})` : ROLE_LABEL[m.role]]));
  // Join codes are loaded only for organizations where this person is President (the same rule the server actions enforce).
  const codes = new Map(await Promise.all(orgs.filter((o) => o.status === "ACTIVE" && hasOrgRole(user, o.id, ["PRESIDENT"])).map(async (o) => [o.id, await getLatestJoinCode(o.id)] as const)));

  return (
    <Page>
      <PageHeader title="Members & Organizations" subtitle="The organizations you help run. Open an organization to see its roster; presidents can also add members, change positions and manage the join code." />
      {orgs.length === 0 ? <EmptyState title="No organizations to manage" /> : (
        <ul className="grid gap-5 lg:grid-cols-2">
          {orgs.map((o) => {
            const manage = o.status === "ACTIVE" && hasOrgRole(user, o.id, ["PRESIDENT"]);
            const code = codes.get(o.id) ?? null;
            return (
              <li key={o.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                <div className="flex items-start gap-4 p-5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true"><Icon name="building" className="h-6 w-6" /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/organizations/${o.id}`} className="group inline-flex max-w-full items-center gap-1.5 text-lg font-semibold leading-snug hover:text-primary">
                      <span className="break-words">{o.name}</span>
                      <span aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary">→</span>
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                      {o.acronym && <Badge tone="purple">{o.acronym}</Badge>}
                      <Badge tone="gray">{SCOPE[o.scope]}</Badge>
                      {o.status !== "ACTIVE" && <Badge tone="amber">Archived</Badge>}
                    </p>
                    {o.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{o.description}</p>}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-4 border-t border-border px-5 py-3 text-sm">
                  <div><dt className="text-muted">Active members</dt><dd className="text-lg font-semibold">{o._count.members}</dd></div>
                  <div><dt className="text-muted">Your position</dt><dd className="font-medium">{position.get(o.id)}</dd></div>
                </dl>
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border bg-sidebar/40 px-5 py-3">
                  <Link href={`/organizations/${o.id}`} className={actionButton}>{canOrg(user, "members.roster", o.id) ? "View roster" : "View"}</Link>
                  {manage && (
                    <>
                      <ModalButton label="+ Add member" variant="action" title="Add member or officer" description={o.name} size="md">
                        <AddMemberForm organizationId={o.id} canAssignPrivileged={false} />
                      </ModalButton>
                      <ModalButton label="Join code" variant="action" title="Join code" description={o.name} size="md">
                        <JoinCodeManager
                          organizationId={o.id}
                          current={code ? { hint: code.codeHint, status: joinCodeStatus(code), expiresAt: code.expiresAt?.toISOString() ?? null, maxUses: code.maxUses, useCount: code.useCount } : null}
                        />
                      </ModalButton>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
