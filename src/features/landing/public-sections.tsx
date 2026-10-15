import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { formatDate, formatTimeSeconds } from "@/lib/format";
import { LANDING_TAG } from "./cache";
import { landingEvents, type LandingEvent } from "./images";
import { publicFeedback, type PublicFeedback } from "./feedback";
import { Stars } from "./stars";

// Public landing-page sections. Their data is cached (shared by every visitor, refreshed whenever an administrator changes
// pictures, featured events or feedback), so the landing page stays fast. Nothing private is read here: only events a
// System Admin chose to show, and approved feedback with first name and last initial.

async function landingData(): Promise<{ events: LandingEvent[]; feedback: PublicFeedback }> {
  "use cache";
  cacheTag(LANDING_TAG);
  try {
    const [events, feedback] = await Promise.all([landingEvents(6), publicFeedback(6)]);
    cacheLife("hours"); // upcoming / past labels move with time; changes refresh it immediately anyway
    return { events, feedback };
  } catch {
    cacheLife("minutes"); // the database was unreachable: show the page without these sections and try again soon
    return { events: [], feedback: { average: null, total: 0, breakdown: [], comments: [] } };
  }
}

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

export async function LandingEvents() {
  const { events } = await landingData();
  if (events.length === 0) return null;
  return (
    <section id="events" aria-labelledby="events-title" className="scroll-mt-20 py-24">
      <div className={container}>
        <div className="flex max-w-2xl flex-col gap-3">
          <span className="text-sm font-semibold text-primary">On campus</span>
          <h2 id="events-title" className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Events run with Tapasok</h2>
          <p className="text-pretty text-lg leading-relaxed text-muted">A look at what student organizations are holding, from general assemblies to the big celebrations.</p>
        </div>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => <EventCard key={e.id} e={e} />)}
        </ul>
      </div>
    </section>
  );
}

function EventCard({ e }: { e: LandingEvent }) {
  const many = e.images.length > 1;
  return (
    <li className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-white hover:border-primary/30 hover:shadow-card">
      <div className="relative">
        {/* Several pictures scroll sideways (swipe on phones); no script needed. */}
        <div className={`flex aspect-[16/10] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] ${many ? "" : "overflow-hidden"}`} tabIndex={many ? 0 : undefined} aria-label={many ? `${e.title}: ${e.images.length} pictures, scroll to see more` : undefined}>
          {e.images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- pictures are served (already resized) by our own route
            <img key={img.id} src={`/event-images/${img.id}`} alt={img.altText ?? (i === 0 ? e.title : `${e.title}, picture ${i + 1}`)} width={img.width} height={img.height}
              loading={i === 0 ? "eager" : "lazy"} decoding="async" className="h-full w-full shrink-0 snap-center object-cover" />
          ))}
        </div>
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${e.upcoming ? "bg-primary text-white" : "bg-white/90 text-foreground"}`}>
          {e.upcoming ? "Upcoming" : "Recent"}
        </span>
        {many && <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-medium text-white" aria-hidden="true">{e.images.length} photos · swipe</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{e.organization.acronym || e.organization.name}</p>
        <h3 className="text-lg font-semibold leading-snug tracking-tight">{e.title}</h3>
        {e.description && <p className="line-clamp-3 text-sm leading-relaxed text-muted">{e.description}</p>}
        <p className="mt-auto pt-2 text-sm text-muted">
          <time dateTime={e.startsAt.toISOString()}>{formatDate(e.startsAt)} · {formatTimeSeconds(e.startsAt, false)}</time>
          <span aria-hidden="true"> · </span>{e.venue}
        </p>
      </div>
    </li>
  );
}

export async function LandingFeedback() {
  const { feedback } = await landingData();
  const { average, total, breakdown, comments } = feedback;
  const max = Math.max(1, ...breakdown.map((b) => b.count));
  return (
    <section id="feedback" aria-labelledby="feedback-title" className="scroll-mt-20 bg-[#faf9fd] py-24">
      <div className={`${container} grid gap-12 lg:grid-cols-[1fr_1.6fr]`}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-primary">Ratings</span>
            <h2 id="feedback-title" className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">What members and officers say</h2>
          </div>
          <div className="rounded-3xl border border-border bg-white p-6">
            {total > 0 && average !== null ? (
              <>
                <div className="flex items-end gap-3">
                  <span className="text-5xl font-semibold tracking-tight">{average.toFixed(1)}</span>
                  <div className="pb-1.5">
                    <Stars value={average} size="h-5 w-5" label={`Average rating ${average.toFixed(1)} out of 5`} />
                    <p className="text-sm text-muted">{total} rating{total === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <dl className="mt-5 flex flex-col gap-1.5">
                  {breakdown.map((b) => (
                    <div key={b.stars} className="flex items-center gap-3 text-sm">
                      <dt className="w-12 shrink-0 text-muted">{b.stars} star{b.stars === 1 ? "" : "s"}</dt>
                      <dd className="flex flex-1 items-center gap-2">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#eeebf6]"><span className="block h-full rounded-full bg-[#f5a524]" style={{ width: `${(b.count / max) * 100}%` }} /></span>
                        <span className="w-8 text-right tabular-nums text-muted">{b.count}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="text-sm text-muted">No ratings yet. Be the first to tell us how Tapasok works for you.</p>
            )}
            <Link href="/login?next=/feedback" className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">Rate Tapasok</Link>
            <p className="mt-2 text-center text-xs text-muted">Sign in to rate. Ratings appear after review.</p>
          </div>
        </div>
        {comments.length > 0 ? (
          <ul className="grid content-start gap-4 sm:grid-cols-2">
            {comments.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 rounded-3xl border border-border bg-white p-6">
                <Stars value={c.rating} />
                <blockquote className="whitespace-pre-line break-words text-sm leading-relaxed">{c.comment}</blockquote>
                <p className="mt-auto flex items-center gap-2 text-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary" aria-hidden="true">{c.name.charAt(0)}</span>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted">· {formatDate(c.at)}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center justify-center rounded-3xl border border-dashed border-border bg-white/60 p-10 text-center text-sm text-muted">
            Comments from members and officers will appear here.
          </div>
        )}
      </div>
    </section>
  );
}
