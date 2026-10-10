import { Page, PageHeader } from "@/components/shared/ui";
import { requireOrgPermissionAnywhere } from "@/lib/permissions";
import { memberSessions } from "@/features/attendance/queries";
import { MemberScanner } from "@/features/attendance/member-scanner";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function MemberScanPage() {
  const user = await requireOrgPermissionAnywhere("org.view");
  const sessions = await memberSessions(user);
  return (
    <Page>
      <PageHeader title="QR Scanner" subtitle="Check in to an event: pick the session, then scan the QR code the organizers display." />
      <MemberScanner
        sessions={sessions.map((s) => ({
          id: s.id, label: s.label, opensAt: s.opensAt.toISOString(), closesAt: s.closesAt.toISOString(), state: s.state, myStatus: s.myStatus,
          event: { ...s.event, startsAt: s.event.startsAt.toISOString(), endsAt: s.event.endsAt.toISOString() },
        }))}
      />
    </Page>
  );
}
