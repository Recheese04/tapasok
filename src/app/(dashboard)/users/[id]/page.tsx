import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge, Page, PageHeader } from "@/components/shared/ui";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { requireSystemPermissionPage } from "@/lib/permissions";
import { academicTree } from "@/features/academic/service";
import { ROLE_LABEL } from "@/features/auth/roles";
import { endMembershipAction } from "@/features/organizations/actions";
import { SetupLinkForm } from "@/features/students/student-forms";
import { getUserForAdmin, organizationOptions } from "@/features/users/queries";
import { AssignMembershipForm, StatusPanel, SystemAdminPanel } from "@/features/users/panels";
import { UserForm } from "@/features/users/user-form";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/features/users/types";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSystemPermissionPage("users.manage");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [user, tree, orgs] = await Promise.all([getUserForAdmin(id), academicTree(), organizationOptions()]);
  if (!user) notFound();

  const sp = user.studentProfile;
  const st = user.staffProfile;
  const type: AccountType = sp ? "STUDENT" : st ? "STAFF" : "ACCOUNT_ONLY";
  const isSelf = user.id === admin.id;
  const active = user.memberships.filter((m) => !m.endedAt);
  const past = user.memberships.filter((m) => m.endedAt);
  const dept = sp?.program?.department;

  const values = {
    userId: user.id, type, firstName: user.firstName, lastName: user.lastName, email: user.email,
    middleName: sp?.middleName ?? st?.middleName ?? null,
    contactNumber: sp?.contactNumber ?? st?.contactNumber ?? null,
    studentNumber: sp?.studentNumber, programId: sp?.programId ?? null, yearLevel: sp?.yearLevel ?? null, rfidUid: sp?.rfidUid ?? null,
    streetAddress: sp?.streetAddress ?? null, regionCode: sp?.regionCode ?? null, provinceCode: sp?.provinceCode ?? null,
    cityCode: sp?.cityCode ?? null, barangayCode: sp?.barangayCode ?? null, hasPhoto: !!sp?.photoKey,
    collegeId: st?.collegeId ?? dept?.collegeId ?? null, departmentId: st?.departmentId ?? dept?.id ?? null,
    employeeId: st?.employeeId, jobTitle: st?.jobTitle ?? null,
  };

  return (
    <Page>
      <PageHeader
        title={`${user.firstName} ${user.lastName}`}
        subtitle={`${ACCOUNT_TYPE_LABEL[type]} · ${user.status === "ACTIVE" ? "Active" : user.status === "INVITED" ? "Awaiting setup" : "Deactivated"} · Last sign-in ${user.lastLoginAt ? user.lastLoginAt.toLocaleString() : "never"}`}
      />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/users" className="hover:underline">User Management</Link> / {user.lastName}, {user.firstName}</nav>

      <section className="flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h2 className="font-medium">Organizations and positions</h2>
        <p className="text-sm text-muted">One account, many organizations. Each position applies only inside its own organization.</p>
        {active.length === 0 ? <p className="text-sm text-muted">Not a member of any organization.</p> : (
          <ul className="divide-y divide-border">
            {active.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <Link href={`/organizations/${m.organization.id}`} className="font-medium text-primary hover:underline">{m.organization.name}</Link>
                  {" — "}{m.title ? `${m.title} (${ROLE_LABEL[m.role]})` : ROLE_LABEL[m.role]}
                  {m.organization.status !== "ACTIVE" && <> <Badge tone="amber">Inactive org</Badge></>}
                </span>
                <form action={endMembershipAction}>
                  <input type="hidden" name="organizationId" value={m.organization.id} />
                  <input type="hidden" name="membershipId" value={m.id} />
                  <ConfirmButton message={`Remove ${user.firstName} ${user.lastName} from ${m.organization.name}? The position is ended and kept in history.`} className="text-danger hover:underline">Revoke</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">Past positions ({past.length})</summary>
            <ul className="mt-1">{past.map((m) => <li key={m.id}>{m.organization.name}: {m.title ?? ROLE_LABEL[m.role]} ({m.startedAt.toLocaleDateString()} – {m.endedAt?.toLocaleDateString()})</li>)}</ul>
          </details>
        )}
        {user.status !== "DISABLED" && <AssignMembershipForm userId={user.id} organizations={orgs} />}
      </section>

      <UserForm tree={tree} values={values} />
      <StatusPanel userId={user.id} status={user.status} isSelf={isSelf} />
      <SystemAdminPanel userId={user.id} isAdmin={user.systemRole === "SYSTEM_ADMIN"} isSelf={isSelf} status={user.status} />
      {!isSelf && user.status !== "DISABLED" && <SetupLinkForm userId={user.id} />}
    </Page>
  );
}
