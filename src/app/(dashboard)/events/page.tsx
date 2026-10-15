import Link from "next/link";
import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { Badge, Page, PageHeader, primaryButton, Table, Td } from "@/components/shared/ui";
import { canOrg, requireOrgPermissionAnywhere, orgIdsWith } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { deletedEvents, listEvents } from "@/features/events/queries";
import { restoreEventAction } from "@/features/events/actions";
import { DeletedList } from "@/components/shared/deleted-list";
import { deleterNames, recentlyRestored } from "@/lib/database/soft-delete";
import { EVENT_TONE } from "@/features/events/constants";
import { EventCreateModal, EventEditModal, EventQrModal } from "@/features/events/event-modals";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

type Sp = { when?: string; page?: string; edit?: string; qr?: string; new?: string };
const uuid = z.uuid();

export default async function EventsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requireOrgPermissionAnywhere("events.view");
  const sp = await searchParams;
  const when = sp.when === "past" ? "past" : "upcoming";
  const page = parsePage(sp.page);
  const [{ total, rows }, deleted] = await Promise.all([listEvents(user, { when, page }), deletedEvents(user)]);
  const deleters = await deleterNames(deleted.map((d) => d.deletedById));
  const canCreate = orgIdsWith(user, "events.manage").length > 0;

  // The list state is kept in the URL; a dialog is just one more parameter, and closing it returns to this exact list.
  const listParams = new URLSearchParams({ when });
  if (page > 1) listParams.set("page", String(page));
  const closeHref = `/events?${listParams.toString()}`;
  const withParam = (key: "edit" | "qr" | "new", value: string) => {
    const p = new URLSearchParams(listParams);
    p.set(key, value);
    return `/events?${p.toString()}`;
  };
  const edit = uuid.safeParse(sp.edit).success ? sp.edit : undefined;
  const qr = uuid.safeParse(sp.qr).success ? sp.qr : undefined;

  const tab = (w: string, label: string) => (
    <Link href={`/events?when=${w}`} aria-current={when === w ? "page" : undefined}
      className={`rounded-lg px-3 py-1 text-sm ${when === w ? "bg-surface font-medium text-primary shadow-sm" : "text-muted hover:bg-surface"}`}>{label}</Link>
  );

  return (
    <Page>
      <PageHeader title="Events" subtitle="Events of your organizations." actions={canCreate && <Link href={withParam("new", "1")} scroll={false} className={primaryButton}>+ Create event</Link>} />
      <nav aria-label="Event filter" className="flex gap-2">{tab("upcoming", "Upcoming")}{tab("past", "Past")}</nav>
      {rows.length === 0 ? (
        <EmptyState title={when === "upcoming" ? "No upcoming events" : "No past events"} />
      ) : (
        <Table head={["Event", "Organization", "When", "Venue", "Status", "Actions"]}>
          {rows.map((e) => (
            <tr key={e.id}>
              <Td><Link className="font-medium text-primary hover:underline" href={`/events/${e.id}`}>{e.title}</Link></Td>
              <Td>{e.organization.name}</Td>
              <Td>{formatDateTime(e.startsAt)}</Td>
              <Td>{e.venue}</Td>
              <Td><span className="flex flex-wrap gap-1"><Badge tone={EVENT_TONE[e.status]}>{e.status.charAt(0) + e.status.slice(1).toLowerCase()}</Badge>{recentlyRestored(e.restoredAt) && <Badge tone="purple">Restored</Badge>}</span></Td>
              <Td>
                <div className="flex flex-wrap gap-3 text-sm">
                  <Link className="font-medium text-primary hover:underline" href={`/events/${e.id}`}>View</Link>
                  {canOrg(user, "events.manage", e.organizationId) && <Link scroll={false} className="font-medium text-primary hover:underline" href={withParam("edit", e.id)}>Edit</Link>}
                  {canOrg(user, "attendance.scan", e.organizationId) && e.status === "PUBLISHED" && <Link scroll={false} className="font-medium text-primary hover:underline" href={withParam("qr", e.id)}>QR Code</Link>}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={page} total={total} basePath="/events" params={{ when }} />
      <DeletedList noun="event" field="eventId" action={restoreEventAction}
        items={deleted.map((d) => ({ id: d.id, title: d.title, detail: `${d.organization.name} · ${formatDateTime(d.startsAt)}`, deletedAt: d.deletedAt!, deletedBy: d.deletedById ? deleters.get(d.deletedById) : null }))} />

      {/* Exactly one dialog at a time; Edit and QR Code never share one. */}
      {sp.new === "1" ? <EventCreateModal user={user} closeHref={closeHref} />
        : edit ? <EventEditModal key={edit} user={user} eventId={edit} closeHref={closeHref} />
        : qr ? <EventQrModal key={qr} user={user} eventId={qr} closeHref={closeHref} />
        : null}
    </Page>
  );
}
