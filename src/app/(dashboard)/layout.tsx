import { cache, Suspense } from "react";
import { AppFrame, SidebarNav, TopbarActions } from "@/components/layout/sidebar";
import { requireUser } from "@/lib/auth/dal";
import { BackForwardGuard } from "@/components/layout/back-forward-guard";
import { navItemsFor } from "@/config/navigation";
import { userRoleLabel } from "@/features/auth/roles";
import { unreadCount } from "@/features/notifications/service";

// Why the layout is split this way:
// Everything about the signed-in person (session cookie, memberships, unread count) is request-time data. If the page
// were rendered inside a component that reads it, every client navigation would have to wait for that read and Next.js
// would report "uncached data during prerendering or a navigation". So the layout is a static frame; the sidebar and the
// top bar are separate async components, each behind its own <Suspense>, and the page is a plain child whose own loading
// boundary is (dashboard)/loading.tsx. Authorization is unchanged: requireUser() redirects to /login here, and every
// page, query and action re-checks it, because a layout alone is never a security boundary.

/** One session lookup and one unread count per request, shared by the sidebar and the top bar (React cache). */
const shellData = cache(async () => {
  const user = await requireUser();
  return { user, unread: await unreadCount(user.id) };
});

async function Sidebar() {
  const { user, unread } = await shellData();
  return <SidebarNav items={navItemsFor(user)} unread={unread} />;
}

async function Topbar() {
  const { user, unread } = await shellData();
  return <TopbarActions displayName={`${user.firstName} ${user.lastName}`} roleLabel={userRoleLabel(user)} unread={unread} />;
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-2" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-xl bg-foreground/5" />)}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame
      nav={<Suspense fallback={<SidebarSkeleton />}><Sidebar /></Suspense>}
      topbar={<Suspense fallback={<div className="ml-auto h-10 w-40 animate-pulse rounded-full bg-foreground/5" aria-hidden="true" />}><Topbar /></Suspense>}
    >
      <BackForwardGuard />
      {children}
    </AppFrame>
  );
}
