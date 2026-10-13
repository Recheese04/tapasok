"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "@/components/shared/ui";

type Tree = { id: string; code: string; name: string; departments: { id: string; name: string }[] }[];

/**
 * Filters for the Student Population section. Every change updates the URL, so the view can be refreshed, shared and
 * navigated back to; the server recomputes the counts. Department choices depend on the chosen college.
 */
export function PopulationFilters({ tree, terms, activeTermId }: { tree: Tree; terms: { id: string; label: string; active: boolean }[]; activeTermId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const college = sp.get("college") ?? "";
  const departments = tree.find((c) => c.id === college)?.departments ?? [];

  const set = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) { if (v) p.set(k, v); else p.delete(k); }
    p.set("tab", "students");
    start(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  const filtered = ["basis", "college", "dept", "st"].some((k) => sp.get(k));

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto_auto] lg:items-end" aria-busy={pending}>
      <div>
        <label htmlFor="pop-basis" className="mb-1 block text-xs font-medium text-muted">Placement</label>
        <select id="pop-basis" value={sp.get("basis") ?? ""} onChange={(e) => set({ basis: e.target.value || null })} className={inputClass}>
          <option value="">Current program and year level</option>
          {terms.map((t) => <option key={t.id} value={t.id}>As enrolled in {t.label}{t.id === activeTermId ? " (active)" : ""}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="pop-college" className="mb-1 block text-xs font-medium text-muted">College</label>
        <select id="pop-college" value={college} onChange={(e) => set({ college: e.target.value || null, dept: null })} className={inputClass}>
          <option value="">All colleges</option>
          {tree.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="pop-dept" className="mb-1 block text-xs font-medium text-muted">Department</label>
        <select id="pop-dept" value={sp.get("dept") ?? ""} disabled={!college} onChange={(e) => set({ dept: e.target.value || null })} className={inputClass}>
          <option value="">{college ? "All departments" : "Choose a college first"}</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm lg:pb-2">
        <input type="checkbox" checked={sp.get("st") === "all"} onChange={(e) => set({ st: e.target.checked ? "all" : null })} />
        Include deactivated accounts
      </label>
      <div className="flex items-center gap-3 lg:pb-2">
        {pending ? <span className="text-xs text-muted" role="status">Updating…</span> : null}
        {filtered ? <button type="button" onClick={() => set({ basis: null, college: null, dept: null, st: null })} className="text-sm font-medium text-primary hover:underline">Reset</button> : null}
      </div>
    </div>
  );
}
