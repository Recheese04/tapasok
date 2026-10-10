import { notFound } from "next/navigation";
import { z } from "zod";
import { Page, PageHeader } from "@/components/shared/ui";
import { requireUser } from "@/lib/auth/dal";
import { canOrg } from "@/lib/permissions";
import { db } from "@/lib/database/client";
import { eventFormData } from "@/features/events/form-data";
import { AnnouncementForm } from "@/features/announcements/announcement-form";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const a = await db.announcement.findUnique({ where: { id }, include: { targets: true } });
  // Not found for anyone who cannot manage announcements in that organization.
  if (!a || !canOrg(user, "announcements.manage", a.organizationId)) notFound();
  const { tree, semesters } = await eventFormData([]);
  return (
    <Page>
      <PageHeader title="Edit announcement" />
      <AnnouncementForm
        tree={tree} semesters={semesters}
        values={{
          id: a.id, title: a.title, body: a.body, published: a.status === "PUBLISHED", semesterId: a.semesterId, targetMode: a.targetMode,
          targets: a.targets.map((t) => ({ collegeId: t.collegeId ?? "", departmentId: t.departmentId ?? "", programId: t.programId ?? "", yearLevel: t.yearLevel?.toString() ?? "" })),
        }}
      />
    </Page>
  );
}
