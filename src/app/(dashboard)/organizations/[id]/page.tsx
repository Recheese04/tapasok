import { ACCOUNT_STATUS_OPTIONS, YEAR_LEVEL_OPTIONS } from "@/components/shared/filter-options";
import { FilterBar } from "@/components/shared/filter-bar";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { OrganizationRole } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/dal";
import { canOrg, hasOrgRole, isSystemAdmin } from "@/lib/permissions";
import { DESIGNATABLE_ROLES } from "@/lib/permissions/policy";
import { getOrganizationForViewer } from "@/features/organizations/queries";
import { endMembershipAction, setOrganizationStatusAction, syncMembersAction } from "@/features/organizations/actions";
import { missingAdviser } from "@/features/organizations/service";
import { pendingRequests, recentDecisions } from "@/features/organizations/requests";
import { JoinRequestReview } from "@/features/organizations/join-review";
import { academicTree } from "@/features/academic/service";
import { ROLE_LABEL } from "@/features/auth/roles";
import { OrganizationForm } from "@/features/organizations/organization-form";
import { AddMemberForm } from "@/features/organizations/add-member-form";
import { ChangePositionButton } from "@/features/organizations/member-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { ModalButton } from "@/components/shared/modal";
import { actionDanger, Badge, Card, Notice, Page, PageHeader, secondaryButton } from "@/components/shared/ui";
import { formatDate } from "@/lib/format";
import { JoinCodeManager } from "@/features/organizations/join-code-manager";
import { getLatestJoinCode, joinCodeStatus } from "@/features/organizations/join-codes";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const SCOPE_LABEL = { DEPARTMENTAL: "Departmental", COLLEGE_WIDE: "College-wide", UNIVERSITY_WIDE: "University-wide", CO_CURRICULAR: "Co-curricular" } as const;
const initials = (f: string, l: string) => `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase();

type Sp = { q?: string; yl?: string; account?: string; role?: string };
const ACCOUNT = { ACTIVE: ["Active", "green"], INVITED: ["Not set up yet", "amber"], DISABLED: ["Disabled", "gray"] } as const;
const ROLES = ["PRESIDENT", "SECRETARY", "TREASURER", "AUDITOR", "OFFICER", "ADVISER", "MEMBER"] as const;

export default async function OrganizationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Sp> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const rosterFilter = {
    q: (sp.q ?? "").trim().slice(0, 100) || undefined,
    yearLevel: sp.yl === "none" ? ("none" as const) : /^[1-6]$/.test(sp.yl ?? "") ? Number(sp.yl) : undefined,
    accountStatus: (["ACTIVE", "INVITED", "DISABLED"] as const).find((x) => x === sp.account),
    role: ROLES.find((x) => x === sp.role),
  };
  const rosterFiltered = !!(rosterFilter.q || rosterFilter.yearLevel || rosterFilter.accountStatus || rosterFilter.role);

  const org = await getOrganizationForViewer(user, id, rosterFilter);
  if (!org) notFound();

  const admin = isSystemAdmin(user);
  const canManageMembers = org.status === "ACTIVE" && hasOrgRole(user, id, ["PRESIDENT"]);
  // The Adviser may designate officers (change positions among Member and the officer positions), nothing else.
  const canDesignate = !canManageMembers && org.status === "ACTIVE" && canOrg(user, "officers.designate", id);
  const designatable = DESIGNATABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  const latestCode = canManageMembers ? await getLatestJoinCode(id) : null;
  const canReview = org.status === "ACTIVE" && canOrg(user, "joinrequests.review", id);
  const [requests, decided] = canReview ? await Promise.all([pendingRequests(id), recentDecisions(id)]) : [[], []];
  const noAdviser = admin ? await missingAdviser(id) : false;
  const tree = admin ? await academicTree() : [];
  const assignable = (["MEMBER", "OFFICER", "SECRETARY", "TREASURER", "AUDITOR", ...(admin ? ["ADVISER", "PRESIDENT"] : [])] as OrganizationRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

  return (
    <Page>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href={admin ? "/organizations" : "/organizations/manage"} className="hover:text-primary hover:underline">{admin ? "Organizations" : "Members & Organizations"}</Link> / {org.name}
      </nav>
      <PageHeader
        title={org.name}
        subtitle={`${SCOPE_LABEL[org.scope]}${org.autoEnroll ? " · members mapped automatically from the academic unit" : ""}${org.description ? ` · ${org.description}` : ""}`}
        actions={
          <>
            {canManageMembers && <ModalButton label="+ Add member" variant="primary" title="Add member or officer" description={org.name} size="md"><AddMemberForm organizationId={org.id} canAssignPrivileged={admin} /></ModalButton>}
            {canManageMembers && (
              <ModalButton label="Join code" title="Join code" description={org.name} size="md">
                <JoinCodeManager
                  organizationId={org.id}
                  current={latestCode ? { hint: latestCode.codeHint, status: joinCodeStatus(latestCode), expiresAt: latestCode.expiresAt?.toISOString() ?? null, maxUses: latestCode.maxUses, useCount: latestCode.useCount } : null}
                />
              </ModalButton>
            )}
            {canManageMembers && org.autoEnroll && (
              <form action={syncMembersAction}>
                <input type="hidden" name="organizationId" value={org.id} />
                <ConfirmButton title="Sync members?" confirmLabel="Sync" message="Re-run the academic mapping and add any enrolled students who are missing? Existing positions are not changed." className={secondaryButton}>Sync members</ConfirmButton>
              </form>
            )}
            {admin && (
              <ModalButton label="Edit organization" title="Edit organization" description={org.name} size="lg">
                <OrganizationForm
                  tree={tree}
                  organization={{ id: org.id, name: org.name, acronym: org.acronym, description: org.description, scope: org.scope, collegeId: org.collegeId, departmentId: org.departmentId, programId: org.programId, autoEnroll: org.autoEnroll }}
                />
              </ModalButton>
            )}
            {admin && (
              <form action={setOrganizationStatusAction}>
                <input type="hidden" name="organizationId" value={org.id} />
                <input type="hidden" name="status" value={org.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"} />
                <ConfirmButton
                  title={org.status === "ACTIVE" ? "Archive organization?" : "Restore organization?"}
                  confirmLabel={org.status === "ACTIVE" ? "Archive" : "Restore"}
                  message={org.status === "ACTIVE" ? `Archive ${org.name}? Its history is kept, but it no longer appears for new activity.` : `Restore ${org.name}?`}
                  className={org.status === "ACTIVE" ? "inline-flex items-center rounded-xl border border-danger/40 bg-danger/5 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10" : secondaryButton}
                >
                  {org.status === "ACTIVE" ? "Archive" : "Restore"}
                </ConfirmButton>
              </form>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        {org.acronym && <Badge tone="purple">{org.acronym}</Badge>}
        <Badge tone={org.status === "ACTIVE" ? "green" : "amber"}>{org.status === "ACTIVE" ? "Active" : "Archived"}</Badge>
        <Badge tone="gray">{SCOPE_LABEL[org.scope]}</Badge>
        <span className="text-sm text-muted">{org.memberCount} active member{org.memberCount === 1 ? "" : "s"}</span>
      </div>
      {noAdviser && <Notice kind="error">This organization has no official adviser assigned. Use Add member to assign one.</Notice>}

      {org.canViewRoster && (
        <section aria-labelledby="members-heading" className="flex flex-col gap-3">
          <h2 id="members-heading" className="text-base font-semibold">Members and officers</h2>
          <FilterBar label="Filter members"
            search={{ placeholder: org.rosterLevel === "full" ? "Name, student number or email" : "Name or student number" }}
            selects={[
              { key: "yl", label: "Year level", all: "All year levels", options: YEAR_LEVEL_OPTIONS },
              { key: "account", label: "Student status", all: "All accounts", options: ACCOUNT_STATUS_OPTIONS },
              { key: "role", label: "Position", all: "All positions", options: ROLES.map((r) => [r, ROLE_LABEL[r]]) },
            ]} />
          {rosterFiltered && <p className="text-sm text-muted" role="status">{org.members.length} of {org.memberCount} members match these filters.</p>}
          {org.members.length === 0 ? (
            <EmptyState title={rosterFiltered ? "No members match these filters" : "No active members"} hint={rosterFiltered ? undefined : canManageMembers ? "Use Add member, or share the join code." : undefined} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="bg-sidebar/70 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                    <th scope="col" className="px-4 py-3 font-semibold">{org.rosterLevel === "full" ? "Email" : "Student no."}</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Program · year</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Position</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Member since</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    {(canManageMembers || canDesignate) && <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>}
                  </tr>
                </thead>
                <tbody className="[&>tr:hover]:bg-primary-soft/30">
                  {org.members.map((m) => {
                    const privileged = m.role === "PRESIDENT" || m.role === "ADVISER";
                    const name = `${m.user.firstName} ${m.user.lastName}`;
                    return (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary" aria-hidden="true">{initials(m.user.firstName, m.user.lastName)}</span>
                            <span className="font-medium">{name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted">{org.rosterLevel === "full" ? <>{m.user.email}{m.user.studentProfile?.studentNumber && <div className="text-xs">{m.user.studentProfile.studentNumber}</div>}</> : (m.user.studentProfile?.studentNumber ?? "—")}</td>
                        <td className="px-4 py-3">{[m.user.studentProfile?.program?.code ?? m.user.studentProfile?.course, m.user.studentProfile?.yearLevel ? `Year ${m.user.studentProfile.yearLevel}` : null].filter(Boolean).join(" · ") || <span className="text-muted">—</span>}</td>
                        <td className="px-4 py-3"><Badge tone={privileged ? "purple" : m.role === "MEMBER" ? "gray" : "green"}>{m.title ? `${m.title} (${ROLE_LABEL[m.role]})` : ROLE_LABEL[m.role]}</Badge></td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(m.startedAt)}</td>
                        <td className="px-4 py-3"><Badge tone={ACCOUNT[m.user.status][1]}>{ACCOUNT[m.user.status][0]}</Badge></td>
                        {canDesignate && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              {DESIGNATABLE_ROLES.includes(m.role)
                                ? <ChangePositionButton organizationId={org.id} membershipId={m.id} name={name} role={m.role} roles={designatable} />
                                : <span className="text-xs text-muted">Set by an administrator</span>}
                            </div>
                          </td>
                        )}
                        {canManageMembers && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              {(admin || !privileged) ? (
                                <>
                                  <ChangePositionButton organizationId={org.id} membershipId={m.id} name={name} role={m.role} roles={assignable} />
                                  <form action={endMembershipAction}>
                                    <input type="hidden" name="organizationId" value={org.id} />
                                    <input type="hidden" name="membershipId" value={m.id} />
                                    <ConfirmButton title="Remove from organization?" confirmLabel="Remove" message={`Remove ${name} from ${org.name}? The membership is ended and kept in history.`} className={actionDanger}>Remove</ConfirmButton>
                                  </form>
                                </>
                              ) : <span className="text-xs text-muted">Set by an administrator</span>}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {canReview && (
        <Card title={`Join requests (${requests.length})`}>
          <JoinRequestReview
            pending={requests.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
            decided={decided.map((d) => ({ ...d, decidedAt: d.decidedAt?.toISOString() ?? null }))}
          />
        </Card>
      )}
    </Page>
  );
}
