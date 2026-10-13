import { EmptyState } from "@/components/shared/empty-state";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { isSystemAdmin } from "@/lib/permissions";
import { listVisibleOrganizations } from "@/features/organizations/queries";
import { JoinSections } from "@/features/organizations/join-sections";
import { AdminOrganizations } from "@/features/organizations/admin-view";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  // System Admin gets the administration dashboard (every query there re-checks the system permission).
  if (isSystemAdmin(user)) return <AdminOrganizations sp={sp} />;

  // Everyone else: only their own organizations, plus joining by code or request.
  const organizations = await listVisibleOrganizations(user);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">My Organizations</h1>
        <p className="text-sm text-muted">Your memberships. Join another organization with a code or by request below.</p>
      </header>

      {organizations.length === 0 ? (
        <EmptyState title="No organizations yet" hint="Join one below with a code from an officer." />
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
                  <td className="px-4 py-3"><Link href={`/organizations/${org.id}`} className="text-sm font-medium text-primary hover:underline">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <JoinSections userId={user.id} />
    </div>
  );
}
