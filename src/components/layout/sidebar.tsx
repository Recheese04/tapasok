"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTION_HEADING, type NavItem } from "@/config/navigation";
import { signOutAction } from "@/features/auth/actions";
import { ConfirmProvider, useConfirm } from "@/components/shared/modal";
import { Icon, type IconName } from "./icons";

// Decorative icon per destination. Labels always remain visible next to them.
const ICONS: Record<string, IconName> = {
  "/dashboard": "home", "/notifications": "bell", "/users": "users", "/academic": "academic", "/organizations": "building", "/reports": "chart",
  "/events": "calendar", "/attendance/live": "scan", "/attendance/records": "clipboard", "/obligations/manage": "task", "/consequences/manage": "alert", "/organizations/manage": "users",
  "/fees/manage": "wallet", "/attendance/scan": "scan", "/attendance": "check", "/obligations": "task", "/consequences": "alert", "/fees": "wallet",
  "/settings": "settings", "/landing-page": "megaphone", "/feedback": "star", "/announcements": "megaphone", "/documents": "file", "/evaluations": "star",
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

/** Profile menu: account actions behind the avatar. Closes on Escape and on outside click. */
function ProfileMenu({ displayName, roleLabel }: { displayName: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 shadow-sm hover:border-primary/40"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden="true">{initials(displayName)}</span>
        <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{displayName}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-60 rounded-2xl border border-border bg-surface p-2 shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="truncate text-xs text-muted">{roleLabel}</p>
          </div>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-sidebar">
            <Icon name="settings" className="h-4 w-4" /> Profile &amp; Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              // Asked first, in a dialog, so a stray click never signs anyone out. (The menu closes behind the dialog, so the
              // sign-out is called directly instead of submitting a form that is no longer on screen.)
              const ok = await confirm({ title: "Sign out?", message: "You will be signed out of Tapasok on this device.", confirmLabel: "Sign out", cancelLabel: "Stay signed in", danger: true });
              if (ok) {
                await signOutAction();
                window.location.replace("/login"); // full load: clears cached signed-in pages and this history entry
              }
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-danger hover:bg-danger/5"
          >
            <Icon name="logout" className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Sidebar links with the active page highlighted. Rendered inside the frame's <aside>. */
export function SidebarNav({ items, unread }: { items: NavItem[]; unread: number }) {
  const pathname = usePathname();

  // Longest matching href wins, and when two sections link to the same page only the first one is highlighted.
  const activeIndex = items
    .map((i, idx) => ({ i, idx }))
    .map(({ i, idx }) => ({ idx, len: Math.max(...[i.href, ...(i.also ?? [])].map((h) => (pathname === h || pathname.startsWith(`${h}/`) ? h.length : -1))) }))
    .filter(({ len }) => len >= 0)
    .sort((a, b) => b.len - a.len || a.idx - b.idx)[0]?.idx;

  const groups: { section: NavItem["section"]; entries: { item: NavItem; idx: number }[] }[] = [];
  items.forEach((item, idx) => {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.entries.push({ item, idx });
    else groups.push({ section: item.section, entries: [{ item, idx }] });
  });

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
      {groups.map((g) => {
        const heading = SECTION_HEADING[g.section];
        const headingId = `nav-${g.section}`;
        return (
          <div key={g.section} role="group" aria-labelledby={heading ? headingId : undefined} className={heading ? "mt-4 flex flex-col gap-0.5" : "flex flex-col gap-0.5"}>
            {heading && <p id={headingId} className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{heading}</p>}
            {g.entries.map(({ item, idx }) => {
              const active = idx === activeIndex;
              const showCount = item.href === "/notifications" && unread > 0;
              return (
                <Link
                  key={`${item.section}:${item.label}`}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                    active ? "bg-primary-soft font-semibold text-primary" : "text-muted hover:bg-sidebar hover:text-foreground"
                  }`}
                >
                  <Icon name={ICONS[item.href] ?? "file"} className="h-[18px] w-[18px] shrink-0" />
                  <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                  {showCount && <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground" aria-label={`${unread} unread`}>{unread}</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/** Notifications bell and profile menu for the top bar. */
export function TopbarActions({ displayName, roleLabel, unread }: { displayName: string; roleLabel: string; unread: number }) {
  return (
    <div className="ml-auto flex items-center gap-3">
      <Link href="/notifications" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} className="relative rounded-full border border-border bg-surface p-2 text-muted shadow-sm hover:border-primary/40 hover:text-primary">
        <Icon name="bell" />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">{unread > 99 ? "99+" : unread}</span>}
      </Link>
      <ProfileMenu displayName={displayName} roleLabel={roleLabel} />
    </div>
  );
}

/**
 * The static frame of every dashboard page: brand, sidebar slot, top bar slot and the page area. It holds no user data
 * itself. The sidebar and top bar are passed in as slots (each behind its own <Suspense> in the layout) and the page is
 * a direct child, so a page never waits on the sidebar and a client navigation can show the page fallback at once.
 * One <aside> serves both layouts: a fixed column on desktop, a slide-over drawer on small screens.
 */
export function AppFrame({ nav, topbar, children }: { nav: React.ReactNode; topbar: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname; // the drawer closes by itself when the route changes

  return (
    <ConfirmProvider>
    <div className="flex min-h-screen">
      {open && <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpenFor(null)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85%] flex-col border-r border-border bg-surface p-4 shadow-xl transition-transform md:sticky md:top-0 md:z-auto md:h-screen md:w-64 md:max-w-none md:translate-x-0 md:shadow-none ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Icon name="cap" className="h-5 w-5" /></span>
          <span className="text-xl font-semibold tracking-tight">Tapasok</span>
        </Link>
        {nav}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-8">
          <button type="button" onClick={() => setOpenFor(pathname)} aria-expanded={open} className="rounded-xl border border-border bg-surface p-2 md:hidden" aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <span className="font-semibold text-primary md:hidden">Tapasok</span>
          {topbar}
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
    </ConfirmProvider>
  );
}
