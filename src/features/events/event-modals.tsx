import "server-only";
import type { AuthUser } from "@/lib/auth/dal";
import { canOrg, orgIdsWith } from "@/lib/permissions";
import { defaultEventTimes, formatDateTime, toManilaLocal } from "@/lib/format";
import { ModalFrame } from "@/components/shared/modal";
import { QrSessionTabs } from "@/features/attendance/qr-session-tabs";
import { SessionQrPanel } from "@/features/attendance/session-qr-panel";
import { EventForm } from "./event-form";
import { eventFormData } from "./form-data";
import { getEventForViewer } from "./queries";

// Dialogs opened from a page through a query parameter (?edit=<id>, ?qr=<id>, ?new=1). The data is loaded here, on the
// server, and every dialog re-checks the permission for the specific organization that owns the event. When the person
// is not allowed, nothing is rendered at all (the same as an unknown id), so a crafted URL reveals nothing.
// Edit and QR Code are separate dialogs: one never contains the other's controls.

export async function EventEditModal({ user, eventId, closeHref }: { user: AuthUser; eventId: string; closeHref: string }) {
  const data = await getEventForViewer(user, eventId);
  if (!data || !canOrg(user, "events.manage", data.event.organizationId)) return null;
  const { event, attendanceCount } = data;
  const form = await eventFormData([event.organizationId]);
  return (
    <ModalFrame title="Edit event" description={event.title} size="xl" closeHref={closeHref}>
      <EventForm
        tree={form.tree}
        semesters={form.semesters}
        rulesByOrg={{ _: form.rulesByOrg[event.organizationId] ?? [] }}
        sessionsLocked={(attendanceCount ?? 0) > 0}
        defaultGrace={form.defaultGrace}
        values={{
          eventId: event.id, title: event.title, description: event.description, venue: event.venue,
          startsAt: toManilaLocal(event.startsAt), endsAt: toManilaLocal(event.endsAt), semesterId: event.semesterId,
          targetMode: event.targetMode, requireEvaluation: event.requireEvaluation, ruleIds: event.rules.map((r) => r.ruleId),
          targets: event.targets.map((t) => ({ collegeId: t.collegeId ?? "", departmentId: t.departmentId ?? "", programId: t.programId ?? "", yearLevel: t.yearLevel?.toString() ?? "" })),
          sessions: event.sessions.map((s) => ({ label: s.label, kind: s.kind, opensAt: toManilaLocal(s.opensAt), startsAt: toManilaLocal(s.startsAt), closesAt: toManilaLocal(s.closesAt), graceMinutes: s.graceMinutes })),
        }}
      />
    </ModalFrame>
  );
}

export async function EventCreateModal({ user, closeHref }: { user: AuthUser; closeHref: string }) {
  const ids = orgIdsWith(user, "events.manage");
  if (ids.length === 0) return null;
  const organizations = [...new Map(user.memberships.filter((m) => ids.includes(m.organizationId)).map((m) => [m.organizationId, { id: m.organizationId, label: m.organizationName }])).values()];
  const data = await eventFormData(ids);
  const t = defaultEventTimes();
  return (
    <ModalFrame title="Create event" description="Times are in Philippine time. Events start as drafts; publish when ready." size="xl" closeHref={closeHref}>
      <EventForm organizations={organizations} values={{ startsAt: t.startsAt, endsAt: t.endsAt }} {...data} />
    </ModalFrame>
  );
}

/** QR Code dialog: only the QR interface for the event's sessions. `sessionId` preselects one session. */
export async function EventQrModal({ user, eventId, sessionId, closeHref }: { user: AuthUser; eventId: string; sessionId?: string; closeHref: string }) {
  const data = await getEventForViewer(user, eventId);
  if (!data || !canOrg(user, "attendance.scan", data.event.organizationId)) return null;
  const { event } = data;
  const published = event.status === "PUBLISHED";
  const items = event.sessions.map((s) => {
    const status = s.finalizedAt ? "Finalized" : !published ? "Event not published" : s.active ? "Open for check-in" : "Not open";
    return {
      id: s.id,
      label: s.label,
      detail: `${s.kind === "TIME_IN" ? "Time-in" : "Time-out"} · ${formatDateTime(s.opensAt)} – ${formatDateTime(s.closesAt)}`,
      status,
      tone: (s.finalizedAt || !published ? "gray" : s.active ? "green" : "amber") as "green" | "amber" | "gray",
      panel: <SessionQrPanel sessionId={s.id} active={s.active} finalized={!!s.finalizedAt} published={published} />,
    };
  });
  return (
    <ModalFrame title="QR Code" description={`${event.title} · ${event.organization.name} · ${event.venue}`} size="lg" closeLabel="Close" closeHref={closeHref}>
      <QrSessionTabs items={items} initialId={sessionId} />
    </ModalFrame>
  );
}
