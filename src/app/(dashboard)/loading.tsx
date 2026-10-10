// Fallback for the page area. It is the <Suspense> boundary around every dashboard page, so client navigations show this
// skeleton instantly (the sidebar and top bar stay mounted) while the page reads the session and its own data.
function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-foreground/5 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Block className="h-8 w-56" />
          <Block className="h-4 w-80 max-w-full" />
        </div>
        <Block className="h-10 w-36" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Block key={i} className="h-20 border border-border bg-surface" />)}
      </div>
      <Block className="h-72 border border-border bg-surface" />
    </div>
  );
}
