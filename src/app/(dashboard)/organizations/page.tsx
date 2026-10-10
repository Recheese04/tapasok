import { EmptyState } from "@/components/shared/empty-state";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { isSystemAdmin } from "@/lib/permissions";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { setOrganizationStatusAction } from "@/features/organizations/actions";
import { listVisibleOrganizations } from "@/features/organizations/queries";
import { JoinSections } from "@/features/organizations/join-sections";
import { ModalFrame } from "@/components/shared/modal";
import { OrganizationForm } from "@/features/organizations/organization-form";
import { academicTree } from "@/features/academic/service";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  // The list is scoped on the server: admins see all organizations, everyone else only their own.
  const user = await requireUser();
  const sp = await searchParams;
  const organizations = await listVisibleOrganizations(user);
  const tree = isSystemAdmin(user) ? await academicTree() : [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{isSystemAdmin(user) ? "Organizations" : "My Organizations"}</h1>
          <p className="text-sm text-muted">{isSystemAdmin(user) ? "All organizations." : "Your memberships. Join another organization with a code or by request below."}</p>
        </div>
        {isSystemAdmin(user) && (
<Link href="/organizations?new=1" scroll={false} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover">
            + New organization
          </Link>
        )}
      </header>

      {organizations.length === 0 ? (
        <EmptyState title="No organizations yet" hint={isSystemAdmin(user) ? undefined : "Join one below with a code from an officer."} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-sidebar/70 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Active members</th>
                <th scope="col" className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr key={org.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/organizations/${org.id}`} className="font-medium text-primary hover:underline">{org.name}</Link>
                    {org.acronym && <span className="ml-2 text-muted">({org.acronym})</span>}
                  </td>
                  <td className="px-4 py-3">{org.status === "ACTIVE" ? "Active" : "Archived"}</td>
                  <td className="px-4 py-3">{org._count.members}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 text-sm">
                      <Link href={`/organizations/${org.id}`} className="font-medium text-primary hover:underline">{isSystemAdmin(user) ? "View / edit" : "View"}</Link>
                      {isSystemAdmin(user) && (
                        <form action={setOrganizationStatusAction}>
                          <input type="hidden" name="organizationId" value={org.id} />
                          <input type="hidden" name="status" value={org.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"} />
                          <ConfirmButton message={org.status === "ACTIVE" ? `Archive ${org.name}? Its history is kept.` : `Restore ${org.name}?`} className={org.status === "ACTIVE" ? "font-medium text-danger hover:underline" : "font-medium text-primary hover:underline"}>{org.status === "ACTIVE" ? "Archive" : "Restore"}</ConfirmButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isSystemAdmin(user) && <JoinSections userId={user.id} />}

      {isSystemAdmin(user) && sp.new === "1" && (
        <ModalFrame title="New organization" description="Set its scope, link it to the academic structure where it applies, and assign its official adviser." size="lg" closeHref="/organizations">
          <OrganizationForm tree={tree} />
        </ModalFrame>
      )}
    </div>
  );
}
