import { Page, PageHeader } from "@/components/shared/ui";
import { requireSystemPermissionPage } from "@/lib/permissions";
import { academicTree } from "@/features/academic/service";
import { UserForm } from "@/features/users/user-form";
import { ACCOUNT_TYPES, type AccountType } from "@/features/users/types";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function NewUserPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireSystemPermissionPage("users.manage");
  const { type } = await searchParams;
  const initialType = (ACCOUNT_TYPES as readonly string[]).includes(type ?? "") ? (type as AccountType) : "STUDENT";
  const tree = await academicTree();
  return (
    <Page>
      <PageHeader title="New account" subtitle="One account per person. Organization positions are added afterwards, per organization." />
      <UserForm tree={tree} initialType={initialType} />
    </Page>
  );
}
