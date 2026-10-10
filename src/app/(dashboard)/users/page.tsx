import Link from "next/link";
import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { actionButton, actionDanger, Badge, inputClass, Page, PageHeader, primaryButton, secondaryButton } from "@/components/shared/ui";
import { requireSystemPermissionPage } from "@/lib/permissions";
import { ROLE_LABEL } from "@/features/auth/roles";
import { listUsers, organizationOptions, type UserFilters } from "@/features/users/queries";
import { toggleUserStatusAction } from "@/features/users/actions";
import { ACCOUNT_TYPE_LABEL } from "@/features/users/types";
import { EditAccountModal, ImportModal, NewAccountModal, ViewAccountModal } from "@/features/users/user-modals";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

type Sp = { q?: string; status?: string; type?: string; org?: string; role?: string; page?: string; new?: string; import?: string; view?: string; edit?: string };

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
    organizationId: uuid.safeParse(sp.org).success ? sp.org : undefined,
    role: pick(sp.role, ["PRESIDENT", "SECRETARY", "TREASURER", "AUDITOR", "OFFICER", "ADVISER", "MEMBER"] as const),
  };
  const [{ total, rows }, orgs] = await Promise.all([listUsers(filters, page), organizationOptions()]);
  const filtered = Object.values(filters).some(Boolean);

  // Filters and page stay in the URL; a dialog is one more parameter and closing it returns to this exact view.
  const base = new URLSearchParams();
  for (const [k, v] of [["q", filters.q], ["status", filters.status], ["type", filters.type], ["org", filters.organizationId], ["role", filters.role]] as const) if (v) base.set(k, v);
  if (page > 1) base.set("page", String(page));
  const href = (extra?: Record<string, string>) => {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
    const q = p.toString();
    return q ? `/users?${q}` : "/users";
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

      <form role="search" className="grid gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-muted">Search</label>
          <input id="q" name="q" defaultValue={filters.q} placeholder="Name, email, student no. or employee ID" className={inputClass} />
        </div>
        <div>
          <label htmlFor="type" className="mb-1 block text-xs font-medium text-muted">Account type</label>
          <select id="type" name="type" defaultValue={filters.type ?? ""} className={inputClass}>
            <option value="">All types</option><option value="STUDENT">Students</option><option value="STAFF">Faculty / staff</option><option value="ACCOUNT_ONLY">Account only</option><option value="ADMIN">System administrators</option>
          </select>
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-muted">Status</label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className={inputClass}>
            <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INVITED">Awaiting setup</option><option value="DISABLED">Deactivated</option>
          </select>
        </div>
        <div>
          <label htmlFor="org" className="mb-1 block text-xs font-medium text-muted">Organization</label>
          <select id="org" name="org" defaultValue={filters.organizationId ?? ""} className={inputClass}>
            <option value="">All organizations</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="role" className="mb-1 block text-xs font-medium text-muted">Position</label>
          <select id="role" name="role" defaultValue={filters.role ?? ""} className={inputClass}>
            <option value="">Any position</option>{Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-1">
          <button type="submit" className={primaryButton}>Apply</button>
          {filtered && <Link href="/users" className="text-sm font-medium text-primary hover:underline">Clear</Link>}
        </div>
      </form>

      <p className="text-sm text-muted" aria-live="polite">{total} account{total === 1 ? "" : "s"}{filtered ? " match these filters" : ""}</p>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? "No accounts match these filters" : "No accounts yet"} hint={filtered ? "Try a different search or clear the filters." : "Create an account or import a CSV file."} />
      ) : (
        <>
          {/* Desktop and tablet: table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-card md:block">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="bg-sidebar/70 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-4 py-3 font-semibold">ID</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Profile</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Organizations &amp; positions</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
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
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{u.studentProfile?.studentNumber ?? u.staffProfile?.employeeId ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone="gray">{ACCOUNT_TYPE_LABEL[type]}</Badge>
                          {u.systemRole === "SYSTEM_ADMIN" && <Badge tone="purple">System admin</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {u.memberships.length === 0 ? <span className="text-muted">None</span> : (
                          <ul className="flex max-w-xs flex-col gap-1">
                            {u.memberships.map((m) => (
                              <li key={m.id} className="text-xs"><span className="font-medium">{m.organization.name}</span> <span className="text-muted">· {m.title ? `${m.title} (${ROLE_LABEL[m.role]})` : ROLE_LABEL[m.role]}</span></li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3"><Badge tone={tone}>{label}</Badge></td>
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
      <Pagination page={page} total={total} basePath="/users" params={{ q: filters.q, status: filters.status, type: filters.type, org: filters.organizationId, role: filters.role }} />

      {/* One dialog at a time, each loaded and authorized on the server. */}
      {sp.new ? <NewAccountModal type={sp.new} closeHref={closeHref} />
        : sp.import === "1" ? <ImportModal closeHref={closeHref} />
        : edit ? <EditAccountModal key={edit} userId={edit} closeHref={closeHref} />
        : view ? <ViewAccountModal key={view} userId={view} editHref={href({ edit: view })} closeHref={closeHref} />
        : null}
    </Page>
  );
}
