import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { isSystemAdmin } from "@/lib/permissions";
import { academicTree } from "@/features/academic/service";
import { OrganizationForm } from "@/features/organizations/organization-form";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function NewOrganizationPage() {
  const user = await requireUser();
  if (!isSystemAdmin(user)) redirect("/organizations");
  const tree = await academicTree();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">New organization</h1>
        <p className="text-sm text-muted">Set the organization&apos;s scope, link it to the academic structure where it applies, and assign its official adviser.</p>
      </header>
      <OrganizationForm tree={tree} />
    </div>
  );
}
