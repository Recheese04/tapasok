import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Badge, ButtonLink, inputClass, Page, PageHeader, secondaryButton, Table, Td } from "@/components/shared/ui";
import { db } from "@/lib/database/client";
import { canOrgAnywhere, requireOrgPermissionAnywhere, orgIdsWith } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { listOrgAttendance } from "@/features/attendance/queries";
import { RegisterDeviceForm } from "@/features/attendance/devices-panel";
import { revokeDeviceAction } from "@/features/attendance/device-actions";
import { eventStatusLabel } from "@/features/events/constants";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const TONE = { PRESENT: "green", LATE: "amber", ABSENT: "red", EXCUSED: "gray" } as const;
const SOURCE = { RFID: "RFID tap", QR_SELF: "QR self check-in", OFFICER_SCAN: "Officer scan", MANUAL: "Manual entry", SYSTEM: "Marked at close" } as const;

export default async function AttendanceRecordsPage({ searchParams }: { searchParams: Promise<{ event?: string; page?: string }> }) {
  const user = await requireOrgPermissionAnywhere("attendance.view_org");
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const eventId = z.uuid().safeParse(sp.event).success ? sp.event : undefined;

  const org = await listOrgAttendance(user, { eventId, page });

  const deviceOrgIds = orgIdsWith(user, "devices.manage");
  const devices = deviceOrgIds.length ? await db.scannerDevice.findMany({ where: { organizationId: { in: deviceOrgIds } }, orderBy: { createdAt: "desc" }, include: { organization: { select: { name: true } } } }) : [];
  const deviceOrgs = [...new Map(user.memberships.filter((m) => deviceOrgIds.includes(m.organizationId)).map((m) => [m.organizationId, { id: m.organizationId, name: m.organizationName }])).values()];

  return (
    <Page>
      <PageHeader title="Attendance Records" subtitle="Check-ins and statuses for the events of organizations you help run. Open an event session to show its QR code or correct a record." actions={<><ButtonLink href="/events">Events &amp; QR</ButtonLink>{canOrgAnywhere(user, "reports.attendance") && (
            // Downloads a file from a route handler, so a plain anchor is correct here.
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a className={secondaryButton} href="/reports/export/attendance">Export CSV</a>
          )}</>} />

      {org && (
        <section aria-labelledby="org-att" className="flex flex-col gap-3">
          <h2 id="org-att" className="font-medium">Organization attendance records</h2>
          <form className="flex max-w-xl gap-2">
            <label htmlFor="event" className="sr-only">Filter by event</label>
            <select id="event" name="event" defaultValue={eventId ?? ""} className={inputClass}>
              <option value="">All events</option>
              {org.events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
            <button type="submit" className={secondaryButton}>Filter</button>
          </form>
          {org.rows.length === 0 ? <EmptyState title="No records" /> : (
            <Table head={["Member", "Student no.", "Event · session", "Status", "Recorded"]}>
              {org.rows.map((r, i) => (
                <tr key={i}>
                  <Td>{r.user.lastName}, {r.user.firstName}</Td>
                  <Td>{r.user.studentProfile?.studentNumber ?? "—"}</Td>
                  <Td>{r.event.title} · {r.session.label}</Td>
                  <Td><Badge tone={TONE[r.status]}>{eventStatusLabel(r.status)}</Badge></Td>
                  <Td>{formatDateTime(r.scannedAt)}<div className="text-xs text-muted">{SOURCE[r.source]}</div></Td>
                </tr>
              ))}
            </Table>
          )}
          <Pagination page={page} total={org.total} basePath="/attendance/records" params={{ event: eventId }} />
        </section>
      )}

      {deviceOrgs.length > 0 && (
        <section aria-labelledby="devices" className="flex flex-col gap-3">
          <h2 id="devices" className="font-medium">RFID terminals</h2>
          <p className="text-sm text-muted">Terminals send card taps to <code>POST /api/rfid/scan</code> with their device key. See the README for the request format. Hardware must be set up and tested separately; Tapasok only provides the endpoint.</p>
          {devices.length > 0 && (
            <Table head={["Device", "Organization", "Status", "Last seen", ""]}>
              {devices.map((d) => (
                <tr key={d.id}>
                  <Td>{d.name}</Td><Td>{d.organization.name}</Td>
                  <Td>{d.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Revoked</Badge>}</Td>
                  <Td>{d.lastSeenAt ? formatDateTime(d.lastSeenAt) : "Never"}</Td>
                  <Td>{d.active && <form action={revokeDeviceAction}><input type="hidden" name="deviceId" value={d.id} /><ConfirmButton message={`Revoke ${d.name}? It will stop working immediately.`} className="text-danger hover:underline">Revoke</ConfirmButton></form>}</Td>
                </tr>
              ))}
            </Table>
          )}
          <RegisterDeviceForm organizations={deviceOrgs} />
        </section>
      )}
    </Page>
  );
}
