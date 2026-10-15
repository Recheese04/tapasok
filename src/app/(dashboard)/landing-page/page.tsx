import Link from "next/link";
import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/shared/pagination";
import { Badge, Card, inputClass, Page, PageHeader, secondaryButton, Table, Td } from "@/components/shared/ui";
import { requireSystemPermissionPage } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { deleterNames, recentlyRestored } from "@/lib/database/soft-delete";
import { adminEventImages, adminLandingEvents, MAX_IMAGES_PER_EVENT } from "@/features/landing/images";
import { moderationList, type ModerationTab } from "@/features/landing/feedback";
import { ImageCard, ImageUploader, ModerationButtons, ModerationFlash, RestoreImageButton, ShowOnLandingToggle } from "@/features/landing/admin-ui";
import { Stars } from "@/features/landing/stars";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

type Sp = { tab?: string; q?: string; page?: string; event?: string; status?: string };

/** System Admin: which events appear on the public landing page (with their pictures), and feedback moderation. */
export default async function LandingPageAdmin({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireSystemPermissionPage("landing.manage");
  const sp = await searchParams;
  const tab = sp.tab === "feedback" ? "feedback" : "events";
  const tabLink = (t: string, label: string) => (
    <Link href={t === "events" ? "/landing-page" : `/landing-page?tab=${t}`} role="tab" aria-selected={tab === t}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>{label}</Link>
  );
  return (
    <Page>
      <PageHeader title="Landing Page" subtitle="Choose the events shown on the public landing page, manage their pictures, and moderate ratings and comments."
        actions={<a href="/" target="_blank" rel="noopener" className={secondaryButton}>View landing page ↗</a>} />
      <div role="tablist" aria-label="View" className="inline-flex self-start rounded-full border border-border bg-surface p-1">
        {tabLink("events", "Event pictures")}
        {tabLink("feedback", "Ratings & comments")}
      </div>
      {tab === "feedback" ? <FeedbackTab sp={sp} /> : z.uuid().safeParse(sp.event).success ? <EventEditor eventId={sp.event!} /> : <EventsTab sp={sp} />}
    </Page>
  );
}

async function EventsTab({ sp }: { sp: Sp }) {
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = parsePage(sp.page);
  const { total, rows } = await adminLandingEvents(q, page, PAGE_SIZE);
  return (
    <section className="flex flex-col gap-4" aria-label="Events">
      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search events or organizations" aria-label="Search events" className={`${inputClass} max-w-sm`} />
        <button type="submit" className={secondaryButton}>Search</button>
      </form>
      <p className="text-sm text-muted">Only published events of active organizations can be shown. Events on the landing page are listed first.</p>
      {rows.length === 0 ? <EmptyState title={q ? "No events match your search" : "No published events yet"} /> : (
        <Table head={["Event", "Organization", "Date", "Pictures", "Landing page", ""]}>
          {rows.map((e) => (
            <tr key={e.id}>
              <Td><span className="font-medium">{e.title}</span><p className="text-xs text-muted">{e.venue}</p></Td>
              <Td>{e.organization.name}</Td>
              <Td>{formatDate(e.startsAt)}</Td>
              <Td className="tabular-nums">{e._count.images}/{MAX_IMAGES_PER_EVENT}</Td>
              <Td>{e.showOnLanding ? <Badge tone="green">Shown</Badge> : <Badge>Not shown</Badge>}</Td>
              <Td><Link href={`/landing-page?event=${e.id}`} className="text-sm font-medium text-primary hover:underline">Manage pictures</Link></Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={page} total={total} basePath="/landing-page" params={{ q: q || undefined }} />
    </section>
  );
}

async function EventEditor({ eventId }: { eventId: string }) {
  const data = await adminEventImages(eventId);
  if (!data) return <EmptyState title="Event not found" hint="It may have been deleted." />;
  const { event, active, removed } = data;
  const eligible = event.status === "PUBLISHED" && event.organization.status === "ACTIVE";
  const deleters = await deleterNames(removed.map((r) => r.deletedById));
  return (
    <div className="flex flex-col gap-5">
      <Link href="/landing-page" className="self-start text-sm font-medium text-primary hover:underline">← All events</Link>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{event.title}</h2>
            <p className="text-sm text-muted">{event.organization.name} · {formatDateTime(event.startsAt)} · {event.venue}</p>
            <p className="mt-2 flex flex-wrap gap-2">
              {event.showOnLanding && eligible ? <Badge tone="green">Shown on the landing page</Badge> : <Badge>Not on the landing page</Badge>}
              {!eligible && <Badge tone="amber">Not published: cannot be shown</Badge>}
            </p>
          </div>
          {eligible && <ShowOnLandingToggle eventId={event.id} shown={event.showOnLanding} canShow={active.length > 0} />}
        </div>
      </Card>

      <Card title={`Pictures (${active.length}/${MAX_IMAGES_PER_EVENT})`}>
        <p className="mb-3 text-sm text-muted">The first picture is the cover on the landing page. Pictures are re-encoded and stored in the database, so they stay after updates.</p>
        {active.length === 0 ? <EmptyState title="No pictures yet" hint="Add one below." /> : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((img, i) => <ImageCard key={img.id} id={img.id} alt={img.altText ?? ""} index={i} first={i === 0} last={i === active.length - 1} />)}
          </ul>
        )}
        {active.some((i) => recentlyRestored(i.restoredAt)) && <p className="mt-2 text-xs text-muted">Restored pictures were added back at the end.</p>}
      </Card>

      {eligible && (
        <Card title="Add pictures">
          <ImageUploader eventId={event.id} remaining={MAX_IMAGES_PER_EVENT - active.length} />
        </Card>
      )}

      {removed.length > 0 && (
        <Card title={`Removed pictures (${removed.length})`}>
          <p className="mb-3 text-sm text-muted">Removed pictures are hidden from the landing page and can be restored.</p>
          <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {removed.map((img) => (
              <li key={img.id} className="flex flex-col gap-2 rounded-2xl border border-dashed border-border p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin-only picture served by our own route */}
                <img src={`/event-images/${img.id}`} alt={img.altText ?? "Removed picture"} className="aspect-video w-full rounded-xl object-cover opacity-60 grayscale" loading="lazy" />
                <p className="text-xs text-muted"><Badge tone="red">Removed</Badge> {img.deletedAt ? formatDateTime(img.deletedAt) : ""}{img.deletedById && deleters.get(img.deletedById) ? ` by ${deleters.get(img.deletedById)}` : ""}</p>
                {eligible && <RestoreImageButton id={img.id} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

const TABS: { key: ModerationTab; label: string }[] = [
  { key: "pending", label: "Waiting" }, { key: "approved", label: "Approved" }, { key: "hidden", label: "Hidden" }, { key: "deleted", label: "Deleted" },
];

async function FeedbackTab({ sp }: { sp: Sp }) {
  const status: ModerationTab = TABS.some((t) => t.key === sp.status) ? (sp.status as ModerationTab) : "pending";
  const page = parsePage(sp.page);
  const { total, rows, counts } = await moderationList(status, page, PAGE_SIZE);
  const deleters = await deleterNames(rows.map((r) => r.deletedById));
  const actionsFor = (r: (typeof rows)[number]) =>
    r.deletedAt ? (["restore"] as const) : r.status === "PENDING" ? (["approve", "hide", "delete"] as const) : r.status === "APPROVED" ? (["hide", "delete"] as const) : (["approve", "delete"] as const);
  return (
    <section className="flex flex-col gap-4" aria-label="Ratings and comments">
      <nav aria-label="Feedback status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/landing-page?tab=feedback&status=${t.key}`} aria-current={status === t.key ? "page" : undefined}
            className={`rounded-lg px-3 py-1 text-sm ${status === t.key ? "bg-surface font-medium text-primary shadow-sm" : "text-muted hover:bg-surface"}`}>
            {t.label} <span className="tabular-nums text-muted">({counts[t.key]})</span>
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted">Only approved entries appear on the landing page and count toward the average. The author&apos;s email is shown here for moderation only; the public sees the first name and last initial.</p>
      <ModerationFlash>
      {rows.length === 0 ? <EmptyState title="Nothing here" /> : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={r.rating} />
                  <span className="text-sm font-medium">{r.user.firstName} {r.user.lastName}</span>
                  <span className="text-xs text-muted">{r.user.email}</span>
                  {r.deletedAt ? <Badge tone="red">Deleted</Badge> : r.status === "APPROVED" ? <Badge tone="green">Approved</Badge> : r.status === "HIDDEN" ? <Badge>Hidden</Badge> : <Badge tone="amber">Waiting</Badge>}
                  {!r.deletedAt && recentlyRestored(r.restoredAt) && <Badge tone="purple">Restored</Badge>}
                  {r.user.status === "DISABLED" && <Badge tone="gray">Account disabled</Badge>}
                </div>
                {r.comment ? <p className="mt-2 whitespace-pre-line break-words text-sm">{r.comment}</p> : <p className="mt-2 text-sm italic text-muted">Rating only, no comment.</p>}
                <p className="mt-1 text-xs text-muted">
                  {r.deletedAt ? `Deleted ${formatDateTime(r.deletedAt)}${r.deletedById && deleters.get(r.deletedById) ? ` by ${deleters.get(r.deletedById)}` : ""}` : `Sent ${formatDateTime(r.updatedAt)}`}
                </p>
              </div>
              <ModerationButtons id={r.id} actions={[...actionsFor(r)]} />
            </li>
          ))}
        </ul>
      )}
      </ModerationFlash>
      <Pagination page={page} total={total} basePath="/landing-page" params={{ tab: "feedback", status }} />
    </section>
  );
}
