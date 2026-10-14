import { notFound } from "next/navigation";
import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge, ButtonLink, Page, PageHeader, Table, Td } from "@/components/shared/ui";
import { requireUser } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { getSessionRoster } from "@/features/attendance/queries";
import { AdjustForm, ManualEntryForm } from "@/features/attendance/session-forms";
import { SessionQrPanel } from "@/features/attendance/session-qr-panel";
import { eventStatusLabel } from "@/features/events/constants";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const TONE = { PRESENT: "green", LATE: "amber", ABSENT: "red", EXCUSED: "gray" } as const;
const SOURCE = { RFID: "RFID tap", QR_SELF: "QR self check-in", OFFICER_SCAN: "Officer scan", MANUAL: "Manual entry", SYSTEM: "Marked at close" } as const;

export default async function SessionPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const user = await requireUser();
  const { id, sid } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(sid).success) notFound();
  const data = await getSessionRoster(user, sid);
  if (!data || data.event.id !== id) notFound();
  const { session, event, rows, can } = data;
  const count = (s: string) => rows.filter((r) => r.record?.status === s).length;

  return (
    <Page>
      <PageHeader title={`${event.title} — ${session.label}`} subtitle={`${event.organization.name} · Venue: ${event.venue} · ${formatDateTime(session.opensAt)} – ${formatDateTime(session.closesAt)}${session.finalizedAt ? " · finalized" : ""}`} actions={!session.finalizedAt && event.status === "PUBLISHED" ? <ButtonLink href={`/attendance/live?session=${session.id}`}>Live monitor</ButtonLink> : undefined} />
      {can.scan && <SessionQrPanel sessionId={session.id} active={session.active} finalized={!!session.finalizedAt} published={event.status === "PUBLISHED"} />}
      <p className="text-sm text-muted">Present {count("PRESENT")} · Late {count("LATE")} · Absent {count("ABSENT")} · Excused {count("EXCUSED")} · Not yet recorded {rows.filter((r) => !r.record).length}</p>
      {rows.length === 0 ? <EmptyState title="No expected attendees" hint="Check the event's target groups and the organization's members." /> : (
        <Table head={["Student", "Student no.", "Status", "How / when", "Actions"]}>
          {rows.map((r) => (
            <tr key={r.userId}>
              <Td>{r.name}{!r.expected && <div className="text-xs text-muted">Not on the attendee list</div>}</Td>
              <Td>{r.studentNumber ?? "—"}</Td>
              <Td>{r.record ? <Badge tone={TONE[r.record.status]}>{eventStatusLabel(r.record.status)}</Badge> : <span className="text-muted">Not recorded</span>}</Td>
              <Td>{r.record ? <>{SOURCE[r.record.source]}<div className="text-xs text-muted">{formatDateTime(r.record.at)}{r.record.remark ? ` · ${r.record.remark}` : ""}</div></> : "—"}</Td>
              <Td>
                {r.record ? <AdjustForm recordId={r.record.id} name={r.name} canManual={can.manual} canExcuse={can.excuse} current={r.record.status} />
                  : can.manual && event.status === "PUBLISHED" ? <ManualEntryForm sessionId={session.id} userId={r.userId} name={r.name} /> : null}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
