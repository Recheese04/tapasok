import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge, ButtonLink, Card, Page, PageHeader, primaryButton, secondaryButton, Table, Td } from "@/components/shared/ui";
import { ConfirmButton, RefreshOnSubmit } from "@/components/shared/confirm-button";
import { requireUser } from "@/lib/auth/dal";
import { canOrg } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { getEventForViewer } from "@/features/events/queries";
import { deleteEventAction, setEventStatusAction } from "@/features/events/actions";
import { EventEditModal, EventQrModal } from "@/features/events/event-modals";
import { EVENT_TONE, eventStatusLabel } from "@/features/events/constants";
import { finalizeSessionAction, setSessionActiveAction } from "@/features/attendance/actions";
import { createEvaluationAction } from "@/features/evaluations/actions";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const STATUS_TONE = { PRESENT: "green", LATE: "amber", ABSENT: "red", EXCUSED: "gray" } as const;

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; qr?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getEventForViewer(user, id);
  if (!data) notFound();
  const { event, attendanceCount, myRecords, creatorName } = data;

  const manage = canOrg(user, "events.manage", event.organizationId);
  const scan = canOrg(user, "attendance.scan", event.organizationId);
  const finalize = canOrg(user, "attendance.manual", event.organizationId);
  const oversee = canOrg(user, "attendance.view_org", event.organizationId);
  const results = canOrg(user, "evaluations.results", event.organizationId);
  const here = `/events/${event.id}`;
  const qrSession = z.uuid().safeParse(sp.qr).success ? sp.qr : undefined;
  const now = new Date();

  const statusBtn = (status: string, label: string, confirm?: string) => (
    <form action={setEventStatusAction}><RefreshOnSubmit />
      <input type="hidden" name="eventId" value={event.id} />
      <input type="hidden" name="status" value={status} />
      {confirm ? <ConfirmButton message={confirm} className={secondaryButton}>{label}</ConfirmButton> : <button type="submit" className={secondaryButton}>{label}</button>}
    </form>
  );
  const mine = new Map(myRecords.map((r) => [r.sessionId, r]));

  return (
    <Page>
      <PageHeader
        title={event.title}
        subtitle={`${event.organization.name} · ${event.venue}`}
        actions={manage && (
          <>
            <Link href={`${here}?edit=1`} scroll={false} className={primaryButton}>Edit event</Link>
            {event.status !== "PUBLISHED" && statusBtn("PUBLISHED", event.status === "CANCELLED" ? "Reinstate & publish" : "Publish")}
            {event.status === "PUBLISHED" && statusBtn("CANCELLED", "Cancel event", "Cancel this event? Members will see it as cancelled and attendance stops.")}
            {event.status === "PUBLISHED" && (attendanceCount ?? 0) === 0 && statusBtn("DRAFT", "Unpublish")}
            {event.status === "DRAFT" && (
              <form action={deleteEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <ConfirmButton message="Delete this draft event? It will be hidden from everyone, and you can restore it from the Events page. Events that were used (attendance, fees, evaluations, documents) cannot be deleted; cancel them instead." className={secondaryButton}>Delete draft</ConfirmButton>
              </form>
            )}
          </>
        )}
      />
      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Status</dt><dd><Badge tone={EVENT_TONE[event.status]}>{eventStatusLabel(event.status)}</Badge></dd></div>
          <div><dt className="text-muted">When</dt><dd>{formatDateTime(event.startsAt)} – {formatDateTime(event.endsAt)}</dd></div>
          <div><dt className="text-muted">Term</dt><dd>{event.semester ? `${event.semester.schoolYear.label} · ${event.semester.name}` : "—"}</dd></div>
          <div><dt className="text-muted">Attendees</dt><dd>{event.targetMode === "ALL_MEMBERS" ? "All student members" : `${event.targets.length} target group${event.targets.length === 1 ? "" : "s"}`}{event.requireEvaluation ? " · evaluation required" : ""}</dd></div>
          <div><dt className="text-muted">Venue</dt><dd>{event.venue}</dd></div>
          <div><dt className="text-muted">Created by</dt><dd>{creatorName ?? "Not recorded"}</dd></div>
        </dl>
        {event.description && <p className="mt-4 whitespace-pre-line text-sm">{event.description}</p>}
      </Card>

      <section aria-labelledby="sessions" className="flex flex-col gap-3">
        <h2 id="sessions" className="font-medium">Attendance sessions</h2>
        <Table head={["Session", "Window", "Your attendance", ...(oversee || scan ? ["Scanner"] : [])]}>
          {event.sessions.map((s) => {
            const rec = mine.get(s.id);
            const open = now >= s.opensAt && now <= s.closesAt && !s.finalizedAt;
            return (
              <tr key={s.id}>
                <Td><div className="font-medium">{s.label}</div><div className="text-xs text-muted">{s.kind === "TIME_IN" ? "Time-in" : "Time-out"} · on time until {s.graceMinutes} min after {formatDateTime(s.startsAt)}</div></Td>
                <Td>{formatDateTime(s.opensAt)} – {formatDateTime(s.closesAt)}{s.finalizedAt ? <div><Badge>Finalized</Badge></div> : open ? <div><Badge tone="green">Open now</Badge></div> : null}</Td>
                <Td>{rec ? <Badge tone={STATUS_TONE[rec.status]}>{eventStatusLabel(rec.status)}</Badge> : s.finalizedAt ? "—" : "Not recorded"}</Td>
                {(oversee || scan) && (
                  <Td>
                    <div className="flex flex-col gap-1 text-sm">
                      {scan && !s.finalizedAt && event.status === "PUBLISHED" && (
                        <form action={setSessionActiveAction}><RefreshOnSubmit />
                          <input type="hidden" name="sessionId" value={s.id} />
                          <input type="hidden" name="active" value={String(!s.active)} />
                          <button type="submit" className="text-primary hover:underline">{s.active ? "Deactivate scanner" : "Activate scanner"}</button>
                        </form>
                      )}
                      {scan && !s.finalizedAt && event.status === "PUBLISHED" && <Link scroll={false} className="text-primary hover:underline" href={`${here}?qr=${s.id}`}>QR Code</Link>}
                      {oversee && !s.finalizedAt && event.status === "PUBLISHED" && <Link className="text-primary hover:underline" href={`/attendance/live?session=${s.id}`}>Live monitor</Link>}
                      {oversee && <Link className="text-primary hover:underline" href={`/events/${event.id}/sessions/${s.id}`}>Attendance list</Link>}
                      {finalize && !s.finalizedAt && event.status === "PUBLISHED" && (
                        <form action={finalizeSessionAction}>
                          <input type="hidden" name="sessionId" value={s.id} />
                          <ConfirmButton message="Finalize this session? Expected attendees without a record will be marked Absent and consequences will be calculated." className="text-danger hover:underline">Close &amp; finalize</ConfirmButton>
                        </form>
                      )}
                    </div>
                  </Td>
                )}
              </tr>
            );
          })}
        </Table>
        {attendanceCount !== null && <p className="text-sm text-muted">{attendanceCount} attendance record{attendanceCount === 1 ? "" : "s"} so far.</p>}
      </section>

      <Card title="Evaluation">
        {event.evaluation ? (
          <ButtonLink href={`/evaluations/${event.evaluation.id}`} variant="secondary">Open evaluation ({event.evaluation.status.toLowerCase()})</ButtonLink>
        ) : manage ? (
          <form action={createEvaluationAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <button type="submit" className={secondaryButton}>Create evaluation form</button>
          </form>
        ) : <p className="text-sm text-muted">{results ? "No evaluation yet." : "No evaluation for this event."}</p>}
      </Card>

      {/* One dialog at a time: Edit event or QR Code, never both. */}
      {sp.edit === "1" ? <EventEditModal user={user} eventId={event.id} closeHref={here} />
        : qrSession ? <EventQrModal user={user} eventId={event.id} sessionId={qrSession} closeHref={here} />
        : null}
    </Page>
  );
}
