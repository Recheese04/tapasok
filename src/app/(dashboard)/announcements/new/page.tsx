import { Page, PageHeader } from "@/components/shared/ui";
import { orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { eventFormData } from "@/features/events/form-data";
import { AnnouncementForm } from "@/features/announcements/announcement-form";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function NewAnnouncementPage() {
  const user = await requireOrgPermissionAnywhere("announcements.manage");
  const ids = orgIdsWith(user, "announcements.manage");
  const organizations = [...new Map(user.memberships.filter((m) => ids.includes(m.organizationId)).map((m) => [m.organizationId, { id: m.organizationId, name: m.organizationName }])).values()];
  const { tree, semesters } = await eventFormData([]);
  return (
    <Page>
      <PageHeader title="New announcement" subtitle="Publishing sends an in-app notification to the audience." />
      <AnnouncementForm organizations={organizations} tree={tree} semesters={semesters} />
    </Page>
  );
}
