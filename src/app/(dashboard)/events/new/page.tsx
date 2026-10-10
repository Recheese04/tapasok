import { Page, PageHeader } from "@/components/shared/ui";
import { requireOrgPermissionAnywhere, orgIdsWith } from "@/lib/permissions";
import { defaultEventTimes } from "@/lib/format";
import { EventForm } from "@/features/events/event-form";
import { eventFormData } from "@/features/events/form-data";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function NewEventPage() {
  const user = await requireOrgPermissionAnywhere("events.manage");
  const ids = orgIdsWith(user, "events.manage");
  const organizations = [...new Map(user.memberships.filter((m) => ids.includes(m.organizationId)).map((m) => [m.organizationId, { id: m.organizationId, label: m.organizationName }])).values()];
  const data = await eventFormData(ids);
  const t = defaultEventTimes();

  return (
    <Page>
      <PageHeader title="Create event" subtitle="Times are in Philippine time. Events start as drafts; publish when ready." />
      <EventForm organizations={organizations} values={{ startsAt: t.startsAt, endsAt: t.endsAt }} {...data} />
    </Page>
  );
}
