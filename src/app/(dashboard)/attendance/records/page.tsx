import { YEAR_LEVEL_OPTIONS } from "@/components/shared/filter-options";
import { FilterBar } from "@/components/shared/filter-bar";
import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Badge, ButtonLink, Page, PageHeader, secondaryButton, Table, Td } from "@/components/shared/ui";
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

type Sp = { event?: string; page?: string; status?: string; yl?: string; q?: string };
const STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;

export default async function AttendanceRecordsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requireOrgPermissionAnywhere("attendance.view_org");
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const eventId = z.uuid().safeParse(sp.event).success ? sp.event : undefined;
  const status = STATUSES.find((x) => x === sp.status);
  const yearLevel = sp.yl === "none" ? ("none" as const) : /^[1-6]$/.test(sp.yl ?? "") ? Number(sp.yl) : undefined;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const filtered = !!(eventId || status || yearLevel || q);

  const org = await listOrgAttendance(user, { eventId, page, status, yearLevel, q });

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
          <FilterBar label="Filter attendance records"
            search={{ placeholder: "Name or student number" }}
            selects={[
              { key: "event", label: "Event", all: "All events", options: org.events.map((e) => [e.id, e.title]) },
              { key: "status", label: "Status", all: "All statuses", options: STATUSES.map((x) => [x, eventStatusLabel(x)]) },
              { key: "yl", label: "Year level", all: "All year levels", options: YEAR_LEVEL_OPTIONS },
            ]} />
          <p className="text-sm text-muted" role="status">{org.total} record{org.total === 1 ? "" : "s"}{filtered ? (org.total === 1 ? " matches these filters" : " match these filters") : ""}.</p>
          {org.rows.length === 0 ? <EmptyState title={filtered ? "No records match these filters" : "No records"} /> : (
            <Table head={["Member", "Event · session", "Status", "Recorded", "Reason"]}>
              {org.rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <span className="font-medium">{r.user.lastName}, {r.user.firstName}</span>
                    <div className="text-xs text-muted">{[r.user.studentProfile?.studentNumber, r.user.studentProfile?.program?.code ?? r.user.studentProfile?.course, r.user.studentProfile?.yearLevel ? `Year ${r.user.studentProfile.yearLevel}` : null].filter(Boolean).join(" · ") || "No student profile"}</div>
                  </Td>
                  <Td><a href={`/events/${r.event.id}/sessions/${r.session.id}`} className="text-primary hover:underline">{r.event.title} · {r.session.label}</a></Td>
                  <Td><Badge tone={TONE[r.status]}>{eventStatusLabel(r.status)}</Badge></Td>
                  <Td>{formatDateTime(r.scannedAt)}<div className="text-xs text-muted">{SOURCE[r.source]}</div></Td>
                  <Td className="max-w-xs">
                    {r.remark ? <span className="whitespace-pre-line break-words">{r.remark}</span> : <span className="text-muted">—</span>}
                    {r.modifiedAt && <div className="text-xs text-muted">Changed {formatDateTime(r.modifiedAt)}{r.modifiedBy ? ` by ${r.modifiedBy}` : ""}</div>}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <Pagination page={page} total={org.total} basePath="/attendance/records" params={{ event: eventId, status, yl: sp.yl && yearLevel !== undefined ? sp.yl : undefined, q: q || undefined }} />
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
