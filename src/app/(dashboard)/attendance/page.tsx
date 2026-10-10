import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge, ButtonLink, Card, Page, PageHeader, Table, Td } from "@/components/shared/ui";
import { requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { myAttendance } from "@/features/attendance/queries";
import { eventStatusLabel } from "@/features/events/constants";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const TONE = { PRESENT: "green", LATE: "amber", ABSENT: "red", EXCUSED: "gray" } as const;
const SOURCE = { RFID: "RFID tap", QR_SELF: "QR self check-in", OFFICER_SCAN: "Officer scan", MANUAL: "Manual entry", SYSTEM: "Marked at close" } as const;

export default async function AttendancePage() {
  const user = await requireOrgPermissionAnywhere("org.view");

  const mine = await myAttendance(user);

  return (
    <Page>
      <PageHeader title="My Attendance" subtitle="Your check-ins and statuses for every event you were expected at, across all your organizations." actions={<ButtonLink href="/attendance/scan">Scan an event QR code</ButtonLink>} />

      <div className="grid gap-6">
        <Card title="My attendance">
          {mine.length === 0 ? <EmptyState title="No attendance recorded yet" /> : (
            <Table head={["Event", "Session", "Status", "Recorded"]}>
              {mine.map((r, i) => (
                <tr key={i}>
                  <Td><Link className="text-primary hover:underline" href={`/events/${r.event.id}`}>{r.event.title}</Link><div className="text-xs text-muted">{r.event.organization.name} · {r.event.venue}</div></Td>
                  <Td>{r.session.label}</Td>
                  <Td><Badge tone={TONE[r.status]}>{eventStatusLabel(r.status)}</Badge></Td>
                  <Td>{formatDateTime(r.scannedAt)}<div className="text-xs text-muted">{SOURCE[r.source]}</div></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

    </Page>
  );
}
