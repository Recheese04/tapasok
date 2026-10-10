"use client";

import Link from "next/link";

/** Shown when a page fails while loading. Keeps the sidebar, explains what happened and offers a way forward. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h1 className="text-lg font-semibold">This page couldn&apos;t be loaded</h1>
      <p className="text-sm text-muted">
        Something went wrong while loading this page. Your data has not been changed. Try again, and if it keeps happening, tell an administrator
        {error.digest ? ` and mention reference ${error.digest}` : ""}.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover">Try again</button>
        <Link href="/dashboard" className="self-center text-sm text-primary hover:underline">Back to dashboard</Link>
      </div>
    </div>
  );
}
