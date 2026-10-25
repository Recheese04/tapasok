"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "@/components/shared/ui";

type Terms = { id: string; label: string; active: boolean; semesters: { id: string; name: string; active: boolean }[] }[];

/**
 * School year, semester and (optionally) year level menus for the finance pages. Choosing an option updates the URL, so
 * the filtered view can be bookmarked or shared and the page reloads with the matching records.
 */
export function FinanceFilterBar({ terms, yearLevel = false, extra }: { terms: Terms; yearLevel?: boolean; extra?: React.ReactNode }) {
  const router = useRouter();
  const sp = useSearchParams();
  const sy = sp.get("sy") ?? terms.find((y) => y.semesters.some((s) => s.id === sp.get("sem")))?.id ?? "";
  const sem = sp.get("sem") ?? "";
  const yl = sp.get("yl") ?? "";
  const year = terms.find((y) => y.id === sy);

  const go = (changes: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) { if (v) p.set(k, v); else p.delete(k); }
    p.delete("page"); // a new filter starts from the first page
    router.push(`?${p.toString()}`, { scroll: false });
  };

  return (
    <div role="group" aria-label="Filter by term" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <label className="flex min-w-40 flex-col gap-1 text-sm font-medium">School year
        <select aria-label="School year" value={sy} onChange={(e) => go({ sy: e.target.value, sem: "" })} className={inputClass}>
          <option value="">All school years</option>
          {terms.map((y) => <option key={y.id} value={y.id}>{y.label}{y.active ? " (current)" : ""}</option>)}
        </select>
      </label>
      <label className="flex min-w-40 flex-col gap-1 text-sm font-medium">Semester
        <select aria-label="Semester" value={sem} disabled={!year} onChange={(e) => go({ sem: e.target.value, sy: e.target.value ? "" : sy })} className={inputClass}>
          <option value="">{year ? "Whole school year" : "Choose a school year first"}</option>
          {year?.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? " (current)" : ""}</option>)}
        </select>
      </label>
      {yearLevel && (
        <label className="flex min-w-36 flex-col gap-1 text-sm font-medium">Year level
          <select aria-label="Year level" value={yl} onChange={(e) => go({ yl: e.target.value })} className={inputClass}>
            <option value="">All year levels</option>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>Year {n}</option>)}
            <option value="none">No year level</option>
          </select>
        </label>
      )}
      {(sy || sem || yl) && <button type="button" onClick={() => go({ sy: "", sem: "", yl: "" })} className="pb-2 text-sm font-medium text-primary hover:underline">Clear filters</button>}
      {extra}
    </div>
  );
}
