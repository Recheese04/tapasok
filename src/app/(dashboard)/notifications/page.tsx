import { ConfirmButton, RefreshOnSubmit } from "@/components/shared/confirm-button";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge, Page, PageHeader, secondaryButton } from "@/components/shared/ui";
import { requireUser } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { listNotifications } from "@/features/notifications/service";
import { clearAllNotificationsAction, clearNotificationAction, markAllReadAction } from "@/features/notifications/actions";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id);
  return (
    <Page>
      <PageHeader title="Notifications" subtitle="In-app updates about your organizations. Opening one marks it as read." actions={items.length > 0 && (
        <>
          {items.some((n) => !n.readAt) && <form action={markAllReadAction}><RefreshOnSubmit /><button type="submit" className={secondaryButton}>Mark all as read</button></form>}
          <form action={clearAllNotificationsAction}>
            <ConfirmButton title="Clear all notifications?" message="Every notification is removed from your list. The announcements, payments and requests they were about are not affected." confirmLabel="Clear all" className={secondaryButton}>Clear all</ConfirmButton>
          </form>
        </>
      )} />
      {items.length === 0 ? <EmptyState title="You're all caught up" /> : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 rounded-2xl border p-4 shadow-card ${n.readAt ? "border-border bg-surface" : "border-primary/30 bg-primary-soft/30"}`}>
              {/* Opening goes through /notifications/[id], which marks it read and then follows its link. */}
              <a href={`/notifications/${n.id}`} className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-primary">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className={n.href ? "text-primary hover:underline" : ""}>{n.title}</span>
                  {!n.readAt && <Badge tone="amber">New</Badge>}
                </p>
                {n.body && <p className="text-sm text-muted">{n.body}</p>}
                <p className="text-xs text-muted">{formatDateTime(n.createdAt)}</p>
              </a>
              <form action={clearNotificationAction}>
                <RefreshOnSubmit />
                <input type="hidden" name="id" value={n.id} />
                <button type="submit" aria-label={`Clear notification: ${n.title}`} title="Clear" className="rounded-lg px-2 py-1 text-lg leading-none text-muted hover:bg-sidebar hover:text-danger">×</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
