import Link from "next/link";
import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { actionButton, actionDanger, Badge, Page, PageHeader, primaryButton, secondaryButton } from "@/components/shared/ui";
import { requireSystemPermissionPage } from "@/lib/permissions";
import { ROLE_LABEL } from "@/features/auth/roles";
import { listUsers, organizationOptions, UNASSIGNED, USER_SORTS, yearLevelsByProgram, type UserFilters, type UserSort } from "@/features/users/queries";
import { UserFilterBar } from "@/features/users/user-filters";
import { academicTree } from "@/features/academic/service";
import { toggleUserStatusAction } from "@/features/users/actions";
import { ACCOUNT_TYPE_LABEL } from "@/features/users/types";
import { formatDate } from "@/lib/format";
import { EditAccountModal, ImportModal, NewAccountModal, ViewAccountModal } from "@/features/users/user-modals";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

type Sp = Record<string, string | undefined>;

const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => allowed.find((a) => a === v);
const uuid = z.uuid();
const STATUS = { ACTIVE: ["green", "Active"], INVITED: ["amber", "Awaiting setup"], DISABLED: ["red", "Deactivated"] } as const;
const initials = (f: string, l: string) => `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase();

export default async function UserManagementPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const admin = await requireSystemPermissionPage("users.manage");
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const filters: UserFilters = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    status: pick(sp.status, ["ACTIVE", "INVITED", "DISABLED"] as const),
    type: pick(sp.type, ["STUDENT", "STAFF", "ACCOUNT_ONLY", "ADMIN"] as const),
    privilege: pick(sp.priv, ["SYSTEM_ADMIN", "USER"] as const),
    organizationId: uuid.safeParse(sp.org).success ? sp.org : undefined,
    role: pick(sp.role, ["PRESIDENT", "SECRETARY", "TREASURER", "AUDITOR", "OFFICER", "ADVISER", "MEMBER"] as const),
    collegeId: uuid.safeParse(sp.college).success ? sp.college : undefined,
    departmentId: uuid.safeParse(sp.dept).success ? sp.dept : undefined,
    programId: sp.program === UNASSIGNED || uuid.safeParse(sp.program).success ? sp.program : undefined,
    yearLevel: sp.year === UNASSIGNED || /^\d{1,2}$/.test(sp.year ?? "") ? sp.year : undefined,
    sort: pick(sp.sort, USER_SORTS),
    dir: sp.dir === "desc" ? "desc" : "asc",
  };
  const [{ total, rows }, orgs, tree, years] = await Promise.all([listUsers(filters, page), organizationOptions(), academicTree(true), yearLevelsByProgram()]);
  const filterKeys = ["q", "type", "status", "priv", "college", "dept", "program", "year", "org", "role"] as const;
  const filtered = filterKeys.some((k) => sp[k]);

  // Filters, sort and page stay in the URL; a dialog is one more parameter and closing it returns to this exact view.
  const base = new URLSearchParams();
  for (const k of [...filterKeys, "sort", "dir"]) { const v = sp[k]; if (v) base.set(k, v); }
  if (page > 1) base.set("page", String(page));
  const href = (extra?: Record<string, string | null>) => {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries(extra ?? {})) { if (v) p.set(k, v); else p.delete(k); }
    const q = p.toString();
    return q ? `/users?${q}` : "/users";
  };
  const sortKey = filters.sort ?? "name";
  // A column header toggles ascending/descending; choosing another column starts ascending, on page 1.
  const sortHeader = (col: UserSort, children: React.ReactNode, className = "") => {
    const on = sortKey === col;
    const nextDir = on && filters.dir === "asc" ? "desc" : "asc";
    return (
      <th scope="col" aria-sort={on ? (filters.dir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-3 font-semibold ${className}`}>
        <Link href={href({ sort: col === "name" && nextDir === "asc" ? null : col, dir: nextDir === "asc" ? null : "desc", page: null })} scroll={false} className={`inline-flex items-center gap-1 hover:text-foreground ${on ? "text-foreground" : ""}`}>
          {children}<span aria-hidden="true" className={on ? "" : "opacity-30"}>{on ? (filters.dir === "asc" ? "▲" : "▼") : "↕"}</span>
        </Link>
      </th>
    );
  };
  const closeHref = href();
  const view = uuid.safeParse(sp.view).success ? sp.view : undefined;
  const edit = uuid.safeParse(sp.edit).success ? sp.edit : undefined;

  return (
    <Page>
      <PageHeader
        title="User Management"
        subtitle="Every account in one place: students, faculty/staff and administrators, with their organization memberships and positions."
        actions={
          <>
            <Link href={href({ import: "1" })} scroll={false} className={secondaryButton}>Import CSV</Link>
            <Link href={href({ new: "STUDENT" })} scroll={false} className={primaryButton}>+ New account</Link>
          </>
        }
      />

      <UserFilterBar
        tree={tree.map((c) => ({ id: c.id, code: c.code, name: c.name, departments: c.departments.map((d) => ({ id: d.id, name: d.name, programs: d.programs.map((p) => ({ id: p.id, code: p.code, name: p.name })) })) }))}
        orgs={orgs} roles={Object.entries(ROLE_LABEL)} years={years}
      />

      <p className="text-sm text-muted" aria-live="polite">{total} account{total === 1 ? "" : "s"}{filtered ? " match these filters" : ""}{filters.sort && filters.sort !== "name" ? " · accounts without a value in the sorted column are listed last" : ""}</p>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? "No accounts match these filters" : "No accounts yet"} hint={filtered ? "Try a different search or clear the filters." : "Create an account or import a CSV file."} />
      ) : (
        <>
          {/* Desktop and tablet: table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-card md:block">
            <table className="w-full min-w-[68rem] text-left text-sm">
              <thead className="bg-sidebar/70 text-xs uppercase tracking-wide text-muted">
                <tr>
                  {sortHeader("name", "Name")}
                  {sortHeader("number", "ID")}
                  {sortHeader("program", "Program")}
                  {sortHeader("year", "Year")}
                  {sortHeader("college", "College")}
                  {sortHeader("department", "Department")}
                  <th scope="col" className="px-4 py-3 font-semibold">Account &amp; positions</th>
                  {sortHeader("status", "Status")}
                  {sortHeader("created", "Created")}
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="[&>tr:hover]:bg-primary-soft/30">
                {rows.map((u) => {
                  const type = u.studentProfile ? "STUDENT" : u.staffProfile ? "STAFF" : "ACCOUNT_ONLY";
                  const [tone, label] = STATUS[u.status];
                  return (
                    <tr key={u.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary" aria-hidden="true">{initials(u.firstName, u.lastName)}</span>
                          <div className="min-w-0">
                            <Link href={href({ view: u.id })} scroll={false} className="block truncate font-medium hover:text-primary hover:underline">{u.lastName}, {u.firstName}</Link>
                            <p className="truncate text-xs text-muted">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">{u.studentProfile?.studentNumber ?? u.staffProfile?.employeeId ?? "—"}</td>
                      <td className="px-4 py-3">
                        {u.studentProfile ? (u.studentProfile.program ? <><span className="font-medium">{u.studentProfile.program.code}</span><p className="max-w-[14rem] truncate text-xs text-muted" title={u.studentProfile.program.name}>{u.studentProfile.program.name}</p></> : <span className="text-xs text-warning">Unassigned</span>)
                          : u.staffProfile?.jobTitle ? <span className="text-xs text-muted">{u.staffProfile.jobTitle}</span> : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">{u.studentProfile ? (u.studentProfile.yearLevel ?? <span className="text-xs text-warning">Unassigned</span>) : <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3 text-xs">{(u.studentProfile?.program?.department.college ?? u.staffProfile?.college)?.code ?? <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3 text-xs">{u.studentProfile?.program?.department.name ?? u.staffProfile?.department?.name ?? <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone="gray">{ACCOUNT_TYPE_LABEL[type]}</Badge>
                          {u.systemRole === "SYSTEM_ADMIN" && <Badge tone="purple">System admin</Badge>}
                        </div>
                        {u.memberships.length > 0 ? (
                          <ul className="mt-1 flex max-w-xs flex-col gap-0.5">
                            {u.memberships.map((m) => (
                              <li key={m.id} className="text-xs"><span className="font-medium">{m.organization.name}</span> <span className="text-muted">· {m.title ? `${m.title} (${ROLE_LABEL[m.role]})` : ROLE_LABEL[m.role]}</span></li>
                            ))}
                          </ul>
                        ) : null}
                      </td>
                      <td className="px-4 py-3"><Badge tone={tone}>{label}</Badge></td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={href({ view: u.id })} scroll={false} className={actionButton}>View</Link>
                          <Link href={href({ edit: u.id })} scroll={false} className={actionButton}>Edit</Link>
                          {u.status !== "INVITED" && u.id !== admin.id && (
                            <form action={toggleUserStatusAction}>
                              <input type="hidden" name="userId" value={u.id} />
                              <input type="hidden" name="active" value={String(u.status !== "ACTIVE")} />
                              <ConfirmButton
                                title={u.status === "ACTIVE" ? "Deactivate account?" : "Reactivate account?"}
                                confirmLabel={u.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                                message={u.status === "ACTIVE" ? `Deactivate ${u.firstName} ${u.lastName}? They are signed out everywhere and cannot sign in. Their records are kept.` : `Reactivate ${u.firstName} ${u.lastName}?`}
                                className={u.status === "ACTIVE" ? actionDanger : actionButton}
                              >
                                {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
                              </ConfirmButton>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per person, so nothing overflows the screen */}
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((u) => {
              const type = u.studentProfile ? "STUDENT" : u.staffProfile ? "STAFF" : "ACCOUNT_ONLY";
              const [tone, label] = STATUS[u.status];
              return (
                <li key={u.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary" aria-hidden="true">{initials(u.firstName, u.lastName)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{u.lastName}, {u.firstName}</p>
                      <p className="break-all text-xs text-muted">{u.email}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge tone={tone}>{label}</Badge><Badge tone="gray">{ACCOUNT_TYPE_LABEL[type]}</Badge>
                        {u.systemRole === "SYSTEM_ADMIN" && <Badge tone="purple">System admin</Badge>}
                      </div>
                      {u.studentProfile ? <p className="mt-2 text-xs">{u.studentProfile.studentNumber} · {u.studentProfile.program?.code ?? "No program"} · {u.studentProfile.yearLevel ? `Year ${u.studentProfile.yearLevel}` : "No year level"}</p> : null}
                      {u.memberships.length > 0 && <p className="mt-2 text-xs text-muted">{u.memberships.map((m) => `${m.organization.name}: ${m.title ?? ROLE_LABEL[m.role]}`).join(" · ")}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={href({ view: u.id })} scroll={false} className={actionButton}>View</Link>
                    <Link href={href({ edit: u.id })} scroll={false} className={actionButton}>Edit</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Pagination page={page} total={total} basePath="/users" params={Object.fromEntries([...filterKeys, "sort", "dir"].map((k) => [k, sp[k]]))} />

      {/* One dialog at a time, each loaded and authorized on the server. */}
      {sp.new ? <NewAccountModal type={sp.new} closeHref={closeHref} />
        : sp.import === "1" ? <ImportModal closeHref={closeHref} />
        : edit ? <EditAccountModal key={edit} userId={edit} closeHref={closeHref} />
        : view ? <ViewAccountModal key={view} userId={view} editHref={href({ edit: view })} closeHref={closeHref} />
        : null}
    </Page>
  );
}
