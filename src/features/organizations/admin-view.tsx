import Link from "next/link";
import { z } from "zod";
import { ActionMenu, menuItem, menuItemDanger } from "@/components/shared/action-menu";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { EmptyState } from "@/components/shared/empty-state";
import { ModalFrame } from "@/components/shared/modal";
import { PAGE_SIZE, parsePage } from "@/components/shared/pagination";
import { Badge, inputClass, Page, PageHeader, primaryButton, StatCard } from "@/components/shared/ui";
import { Icon } from "@/components/layout/icons";
import { academicTree } from "@/features/academic/service";
import { membershipCounts, studentPopulation, UNASSIGNED, type GroupFilter } from "@/features/academic/population";
import { GroupDialog, PopulationSection } from "@/features/academic/population-section";
import { PopulationFilters } from "@/features/academic/population-filters";
import { ROLE_LABEL } from "@/features/auth/roles";
import { formatDate } from "@/lib/format";
import { setOrganizationStatusAction } from "./actions";
import { adminOrganizationDetails, adminOrganizationMembers, adminOrganizations, type OrgScope } from "./admin-queries";
import { OrganizationForm } from "./organization-form";

export type AdminSp = Record<string, string | undefined>;

const SCOPE: Record<OrgScope, string> = { CO_CURRICULAR: "Co-curricular", DEPARTMENTAL: "Departmental", COLLEGE_WIDE: "College-wide", UNIVERSITY_WIDE: "University-wide" };
const uuid = z.uuid();
const id = (v: string | undefined) => (uuid.safeParse(v).success ? v : undefined);
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => allowed.find((a) => a === v);

/** System Admin: organizations, their members, and the student population, with dialogs driven by the URL. */
export async function AdminOrganizations({ sp }: { sp: AdminSp }) {
  const tab = sp.tab === "students" ? "students" : "orgs";
  const status = pick(sp.status, ["ACTIVE", "ARCHIVED"] as const);
  const scope = pick(sp.scope, ["CO_CURRICULAR", "DEPARTMENTAL", "COLLEGE_WIDE", "UNIVERSITY_WIDE"] as const);
  const q = sp.q?.slice(0, 100) || undefined;
  const basis = id(sp.basis) ?? "current";
  const st = sp.st === "all" ? "all" : "active";

  const [tree, pop, members, orgs] = await Promise.all([
    academicTree(true),
    studentPopulation({ basis, status: st }),
    membershipCounts(st),
    adminOrganizations({ q, status, scope }),
  ]);

  // Every view, filter and dialog lives in the URL, so closing a dialog returns to exactly this view.
  const href = (changes: Record<string, string | null | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && !["new", "view", "edit", "members"].includes(k)) p.set(k, v);
    for (const [k, v] of Object.entries(changes)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return s ? `/organizations?${s}` : "/organizations";
  };
  const closeGroup = href({ gp: null, gy: null, gc: null, gd: null, gq: null, gpage: null });
  const collegeId = id(sp.college);
  const departmentId = id(sp.dept);
  const groupOpen = !!(sp.gp || sp.gy || sp.gc || sp.gd);
  const groupFilter: GroupFilter = {
    basis, status: st, q: sp.gq?.slice(0, 100),
    programId: sp.gp === UNASSIGNED ? UNASSIGNED : id(sp.gp),
    yearLevel: sp.gy === UNASSIGNED || /^\d{1,2}$/.test(sp.gy ?? "") ? sp.gy : undefined,
    collegeId: id(sp.gc), departmentId: id(sp.gd),
  };
  const view = id(sp.view), edit = id(sp.edit), membersOf = id(sp.members);
  const tabLink = (t: string, label: string) => (
    <Link href={href({ tab: t === "orgs" ? null : t })} scroll={false} role="tab" aria-selected={tab === t}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>{label}</Link>
  );

  return (
    <Page>
      <PageHeader
        title="Organizations"
        subtitle="Every organization in the school, its members, and how students are distributed across colleges, departments and programs."
        actions={<Link href={href({ new: "1" })} scroll={false} className={primaryButton}>+ New organization</Link>}
      />

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Students" value={pop.total} hint={st === "active" ? "Registered, not deactivated" : "Including deactivated"} icon={<Icon name="academic" />} />
        <StatCard label="Colleges" value={pop.counts.colleges} hint="Active" icon={<Icon name="building" />} tone="blue" />
        <StatCard label="Departments" value={pop.counts.departments} hint="Active" icon={<Icon name="building" />} tone="blue" />
        <StatCard label="Programs" value={pop.counts.programs} hint="Active" icon={<Icon name="cap" />} tone="blue" />
        <StatCard label="Organizations" value={orgs.totals.active} hint={orgs.totals.archived ? `${orgs.totals.archived} archived` : "Active"} icon={<Icon name="users" />} tone="green" />
        <StatCard label="Students in organizations" value={members.uniqueStudents} hint={`${members.memberships} memberships in total`} icon={<Icon name="userPlus" />} tone="amber" />
      </section>

      <div role="tablist" aria-label="View" className="inline-flex self-start rounded-full border border-border bg-surface p-1">
        {tabLink("orgs", "Organizations")}
        {tabLink("students", "Student population")}
      </div>

      {tab === "students" ? (
        <>
          <PopulationFilters tree={tree.map((c) => ({ id: c.id, code: c.code, name: c.name, departments: c.departments.map((d) => ({ id: d.id, name: d.name })) }))} terms={pop.terms} activeTermId={pop.activeTermId} />
          <PopulationSection pop={pop} href={href} collegeId={collegeId} departmentId={departmentId} />
          {groupOpen ? <GroupDialog key={`${sp.gp}-${sp.gy}-${sp.gc}-${sp.gd}-${sp.gq}-${sp.gpage}`} pop={pop} filter={groupFilter} page={parsePage(sp.gpage)} href={href} closeHref={closeGroup} /> : null}
        </>
      ) : (
        <>
          <form role="search" action="/organizations" className="grid gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
            <div className="sm:col-span-2 lg:col-span-1">
              <label htmlFor="org-q" className="mb-1 block text-xs font-medium text-muted">Search</label>
              <input id="org-q" name="q" defaultValue={q} placeholder="Name or acronym" className={inputClass} />
            </div>
            <div>
              <label htmlFor="org-status" className="mb-1 block text-xs font-medium text-muted">Status</label>
              <select id="org-status" name="status" defaultValue={status ?? ""} className={inputClass}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select>
            </div>
            <div>
              <label htmlFor="org-scope" className="mb-1 block text-xs font-medium text-muted">Scope</label>
              <select id="org-scope" name="scope" defaultValue={scope ?? ""} className={inputClass}><option value="">All scopes</option>{Object.entries(SCOPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" className={primaryButton}>Apply</button>
              {q || status || scope ? <Link href="/organizations" className="text-sm font-medium text-primary hover:underline">Clear</Link> : null}
            </div>
          </form>
          <p className="text-sm text-muted" aria-live="polite">{orgs.rows.length} organization{orgs.rows.length === 1 ? "" : "s"}{q || status || scope ? " match these filters" : ""}. Member counts are active memberships; “students” counts members with a student account.</p>

          {orgs.rows.length === 0 ? (
            <EmptyState title={q || status || scope ? "No organizations match these filters" : "No organizations yet"} hint={q || status || scope ? "Try another search or clear the filters." : "Create the first one with “New organization”."} />
          ) : (
            <>
              <div className="hidden rounded-2xl border border-border bg-surface shadow-card md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sidebar/70 text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="rounded-tl-2xl px-4 py-3 font-semibold">Organization</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Scope</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Adviser</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Members</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                      <th scope="col" className="rounded-tr-2xl px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.rows.map((o) => (
                      <tr key={o.id} className="border-t border-border hover:bg-primary-soft/20">
                        <td className="px-4 py-3">
                          <Link href={href({ view: o.id })} scroll={false} className="font-medium hover:text-primary hover:underline">{o.name}</Link>
                          <p className="text-xs text-muted">{[o.acronym, o.unit].filter(Boolean).join(" · ") || "—"}{o.pendingRequests ? <> · <span className="text-warning">{o.pendingRequests} join request{o.pendingRequests === 1 ? "" : "s"}</span></> : null}</p>
                        </td>
                        <td className="px-4 py-3"><Badge tone="gray">{SCOPE[o.scope]}</Badge>{o.autoEnroll ? <p className="mt-1 text-xs text-muted">Automatic membership</p> : null}</td>
                        <td className="px-4 py-3">{o.adviser ?? <span className="text-xs font-medium text-danger">No adviser</span>}</td>
                        <td className="px-4 py-3 text-right tabular-nums"><Link href={href({ members: o.id })} scroll={false} className="font-semibold hover:text-primary hover:underline">{o.members}</Link><p className="text-xs text-muted">{o.students} student{o.students === 1 ? "" : "s"}</p></td>
                        <td className="px-4 py-3"><Badge tone={o.status === "ACTIVE" ? "green" : "amber"}>{o.status === "ACTIVE" ? "Active" : "Archived"}</Badge></td>
                        <td className="px-4 py-3 text-right"><RowMenu o={o} href={href} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col gap-3 md:hidden">
                {orgs.rows.map((o) => (
                  <li key={o.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={href({ view: o.id })} scroll={false} className="break-words font-medium hover:text-primary">{o.name}</Link>
                        <p className="text-xs text-muted">{[o.acronym, SCOPE[o.scope], o.unit].filter(Boolean).join(" · ")}</p>
                      </div>
                      <RowMenu o={o} href={href} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={o.status === "ACTIVE" ? "green" : "amber"}>{o.status === "ACTIVE" ? "Active" : "Archived"}</Badge>
                      <span className="text-muted">{o.members} members · {o.students} students</span>
                      {!o.adviser ? <span className="text-xs font-medium text-danger">No adviser</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {sp.new === "1" ? (
        <ModalFrame title="New organization" description="Set its scope, link it to the academic structure where it applies, and assign its official adviser." size="lg" closeHref={href({})}>
          <OrganizationForm tree={await academicTree()} />
        </ModalFrame>
      ) : edit ? <EditDialog id={edit} closeHref={href({})} />
        : view ? <DetailsDialog id={view} href={href} />
        : membersOf ? <MembersDialog id={membersOf} sp={sp} href={href} />
        : null}
    </Page>
  );
}

type Row = Awaited<ReturnType<typeof adminOrganizations>>["rows"][number];

function RowMenu({ o, href }: { o: Row; href: (c: Record<string, string | null>) => string }) {
  return (
    <ActionMenu label={`Actions for ${o.name}`}>
      <Link href={href({ view: o.id })} scroll={false} className={menuItem}>View details</Link>
      <Link href={href({ edit: o.id })} scroll={false} className={menuItem}>Edit</Link>
      <Link href={href({ members: o.id })} scroll={false} className={menuItem}>Members ({o.members})</Link>
      <Link href={`/organizations/${o.id}`} className={menuItem}>Manage members &amp; positions</Link>
      <div className="my-1 border-t border-border" role="separator" />
      <form action={setOrganizationStatusAction}>
        <input type="hidden" name="organizationId" value={o.id} />
        <input type="hidden" name="status" value={o.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"} />
        <ConfirmButton
          title={o.status === "ACTIVE" ? `Archive ${o.name}?` : `Restore ${o.name}?`}
          confirmLabel={o.status === "ACTIVE" ? "Archive" : "Restore"}
          message={o.status === "ACTIVE"
            ? "It stops accepting new members, events and requests. Nothing is deleted: members, attendance, fees and history are kept, and you can restore it later."
            : "It becomes active again with its members and history."}
          className={o.status === "ACTIVE" ? menuItemDanger : menuItem}
        >
          {o.status === "ACTIVE" ? "Archive…" : "Restore…"}
        </ConfirmButton>
      </form>
    </ActionMenu>
  );
}

async function DetailsDialog({ id, href }: { id: string; href: (c: Record<string, string | null>) => string }) {
  const o = await adminOrganizationDetails(id);
  if (!o) return <ModalFrame title="Organization not found" closeLabel="Close" closeHref={href({})}><p className="text-sm text-muted">It may have been removed.</p></ModalFrame>;
  const unit = o.program ? `${o.program.code} · ${o.program.name}` : o.department ? o.department.name : o.college ? `${o.college.code} · ${o.college.name}` : "Not linked";
  const fact = (label: string, value: React.ReactNode) => <div><dt className="text-xs text-muted">{label}</dt><dd className="font-medium">{value}</dd></div>;
  return (
    <ModalFrame title={o.name} description={[o.acronym, SCOPE[o.scope as OrgScope]].filter(Boolean).join(" · ")} size="lg" closeLabel="Close" closeHref={href({})}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2"><Badge tone={o.status === "ACTIVE" ? "green" : "amber"}>{o.status === "ACTIVE" ? "Active" : "Archived"}</Badge>{o.autoEnroll ? <Badge tone="purple">Automatic membership</Badge> : null}</div>
        {o.description ? <p className="text-sm">{o.description}</p> : null}
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {fact("Academic unit", unit)}
          {fact("Created", formatDate(o.createdAt))}
          {fact("Active members", o.members)}
          {fact("Students among members", o.students)}
          {fact("Pending join requests", o._count.joinRequests)}
          {fact("Events", o._count.events)}
          {fact("Announcements", o._count.announcements)}
          {fact("Documents", o._count.documents)}
          {fact("Active RFID terminals", o._count.devices)}
        </dl>
        <section aria-labelledby="det-roles">
          <h3 id="det-roles" className="mb-2 text-sm font-semibold">Members by position</h3>
          <ul className="flex flex-wrap gap-2 text-sm">
            {Object.entries(ROLE_LABEL).filter(([r]) => o.byRole[r]).map(([r, l]) => <li key={r} className="rounded-full bg-sidebar px-3 py-1">{l}: <strong>{o.byRole[r]}</strong></li>)}
            {o.members === 0 ? <li className="text-muted">No members yet.</li> : null}
          </ul>
        </section>
        <section aria-labelledby="det-officers">
          <h3 id="det-officers" className="mb-2 text-sm font-semibold">Officers and adviser</h3>
          {o.officers.length === 0 ? <p className="text-sm text-danger">No officers or adviser assigned.</p> : (
            <ul className="grid gap-1 text-sm sm:grid-cols-2">{o.officers.map((x, i) => <li key={i}><span className="font-medium">{x.name}</span> <span className="text-muted">· {x.title ? `${x.title} (${ROLE_LABEL[x.role]})` : ROLE_LABEL[x.role]}</span></li>)}</ul>
          )}
        </section>
        <div className="flex flex-wrap gap-2">
          <Link href={href({ edit: o.id })} scroll={false} className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-sidebar">Edit</Link>
          <Link href={href({ members: o.id })} scroll={false} className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-sidebar">View members</Link>
          <Link href={`/organizations/${o.id}`} className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-sidebar">Manage members &amp; positions</Link>
        </div>
      </div>
    </ModalFrame>
  );
}

async function EditDialog({ id, closeHref }: { id: string; closeHref: string }) {
  const [o, tree] = await Promise.all([adminOrganizationDetails(id), academicTree()]);
  if (!o) return <ModalFrame title="Organization not found" closeLabel="Close" closeHref={closeHref}><p className="text-sm text-muted">It may have been removed.</p></ModalFrame>;
  return (
    <ModalFrame title={`Edit ${o.name}`} description="Name, scope and academic link. Members and positions are managed on the organization's page." size="lg" closeHref={closeHref}>
      <OrganizationForm tree={tree} organization={{ id: o.id, name: o.name, acronym: o.acronym, description: o.description, scope: o.scope as OrgScope, collegeId: o.collegeId, departmentId: o.departmentId, programId: o.programId, autoEnroll: o.autoEnroll }} />
    </ModalFrame>
  );
}

async function MembersDialog({ id, sp, href }: { id: string; sp: AdminSp; href: (c: Record<string, string | null>) => string }) {
  const page = parsePage(sp.mpage);
  const [o, { total, rows }] = await Promise.all([adminOrganizationDetails(id), adminOrganizationMembers(id, { q: sp.mq, page })]);
  const close = href({ mq: null, mpage: null });
  if (!o) return <ModalFrame title="Organization not found" closeLabel="Close" closeHref={close}><p className="text-sm text-muted">It may have been removed.</p></ModalFrame>;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const here = (c: Record<string, string | null>) => href({ members: id, ...c });
  return (
    <ModalFrame title={`Members of ${o.name}`} description={`${o.members} active members · ${o.students} with a student account`} size="lg" closeLabel="Close" closeHref={close}>
      <div className="flex flex-col gap-4">
        <form role="search" action="/organizations" className="flex gap-2">
          {Object.entries(Object.fromEntries(new URL(here({ mq: null, mpage: null }), "http://x").searchParams)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="search" name="mq" defaultValue={sp.mq} placeholder="Search name, email or student number, then press Enter" aria-label="Search members" className={inputClass} />
        </form>
        {rows.length === 0 ? <p className="rounded-xl border border-border bg-sidebar px-4 py-6 text-center text-sm text-muted">{sp.mq ? "No members match this search." : "No active members."}</p> : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="bg-sidebar/70 text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2.5">Name</th><th className="px-3 py-2.5">Student no.</th><th className="px-3 py-2.5">Program · year</th><th className="px-3 py-2.5">Position</th><th className="px-3 py-2.5">Since</th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-2.5"><Link href={`/users/${m.user.id}`} className="font-medium hover:text-primary hover:underline">{m.user.lastName}, {m.user.firstName}</Link><p className="text-xs text-muted">{m.user.email}</p></td>
                    <td className="px-3 py-2.5 tabular-nums">{m.user.studentProfile?.studentNumber ?? <span className="text-muted">Not a student</span>}</td>
                    <td className="px-3 py-2.5">{m.user.studentProfile ? `${m.user.studentProfile.program?.code ?? "Unassigned"}${m.user.studentProfile.yearLevel ? ` · Year ${m.user.studentProfile.yearLevel}` : ""}` : "—"}</td>
                    <td className="px-3 py-2.5"><Badge tone={m.role === "MEMBER" ? "gray" : m.role === "PRESIDENT" || m.role === "ADVISER" ? "purple" : "green"}>{m.title ? `${m.title} (${ROLE_LABEL[m.role]})` : ROLE_LABEL[m.role]}</Badge></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatDate(m.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
              {page > 1 ? <Link scroll={false} href={here({ mpage: String(page - 1) })} className="rounded-lg border border-border px-3 py-1 hover:bg-sidebar">Previous</Link> : null}
              <span className="text-muted">Page {page} of {pages}</span>
              {page < pages ? <Link scroll={false} href={here({ mpage: String(page + 1) })} className="rounded-lg border border-border px-3 py-1 hover:bg-sidebar">Next</Link> : null}
            </nav>
          ) : <span />}
          <Link href={`/organizations/${id}`} className="text-sm font-medium text-primary hover:underline">Add, remove or change positions →</Link>
        </div>
      </div>
    </ModalFrame>
  );
}
