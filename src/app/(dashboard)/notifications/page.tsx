import Link from "next/link";
import { RefreshOnSubmit } from "@/components/shared/confirm-button";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge, Page, PageHeader, secondaryButton } from "@/components/shared/ui";
import { requireUser } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { listNotifications } from "@/features/notifications/service";
import { markAllReadAction } from "@/features/notifications/actions";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id);
  return (
    <Page>
      <PageHeader title="Notifications" subtitle="In-app updates about your organizations." actions={items.some((n) => !n.readAt) && (
        <form action={markAllReadAction}><RefreshOnSubmit /><button type="submit" className={secondaryButton}>Mark all as read</button></form>
      )} />
      {items.length === 0 ? <EmptyState title="You're all caught up" /> : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <p className="flex items-center gap-2 font-medium">{n.href ? <Link className="text-primary hover:underline" href={n.href}>{n.title}</Link> : n.title} {!n.readAt && <Badge tone="amber">New</Badge>}</p>
              {n.body && <p className="text-sm text-muted">{n.body}</p>}
              <p className="text-xs text-muted">{formatDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
