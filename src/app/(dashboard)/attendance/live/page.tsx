import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge, Page, PageHeader } from "@/components/shared/ui";
import { requireUser } from "@/lib/auth/dal";
import { canOrgAnywhere } from "@/lib/permissions";
import { liveSession, monitorableSessions } from "@/features/attendance/live";
import { LiveMonitor } from "@/features/attendance/live-monitor";

// Signed-in page that reads the session and live attendance on every request.
export const instant = false;

/**
 * Live attendance monitor for officers. With ?session=<id> it shows that session; otherwise it opens the one session that is
 * open now, or lets the officer choose. Only sessions of organizations where the viewer may see attendance are offered.
 */
export default async function LiveAttendancePage({ searchParams }: { searchParams: Promise<{ session?: string; pick?: string }> }) {
  const user = await requireUser();
  if (!canOrgAnywhere(user, "attendance.view_org")) notFound();
  const sp = await searchParams;
  const choices = await monitorableSessions(user);
  const open = choices.filter((c) => c.open);
  // ?pick=1 shows the list even when exactly one session is open (the "Switch session" link).
  const sessionId = z.uuid().safeParse(sp.session).success ? sp.session! : open.length === 1 && !sp.pick ? open[0].id : null;
  const data = sessionId ? await liveSession(user, sessionId) : null;
  if (sessionId && !data) notFound();

  return (
    <Page>
      <PageHeader
        title={data ? `${data.event.title} · ${data.session.label}` : "Live attendance"}
        subtitle={data ? `${data.event.organization}${data.event.venue ? ` · ${data.event.venue}` : ""} · live check-ins as they are recorded` : "Watch check-ins as students tap their cards or scan the QR code."}
        actions={data && choices.length > 1 ? <Link href="/attendance/live?pick=1" className="text-sm font-medium text-primary hover:underline">Switch session</Link> : undefined}
      />
      {data ? <LiveMonitor key={data.session.id} initial={data} /> : (
        <>
          {open.length === 0 ? (
            <EmptyState title="No attendance is open right now" hint="Open check-in on an event's session (Activate scanner on the website, or Open in the app), then come back here." />
          ) : <p className="text-sm text-muted">{open.length > 1 ? "More than one session is open. Choose the one to watch." : "Choose the session to watch."}</p>}
          {choices.length > 0 ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {choices.map((c) => (
                <li key={c.id}>
                  <Link href={`/attendance/live?session=${c.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card hover:border-primary/40">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.event} · {c.label}</span>
                      <span className="block text-xs text-muted">{c.organization} · {c.window}</span>
                    </span>
                    <Badge tone={c.open ? "green" : "gray"}>{c.open ? "Open now" : "Closed"}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Page>
  );
}
