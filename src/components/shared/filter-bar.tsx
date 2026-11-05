"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "@/components/shared/ui";

export type FilterSelect = {
  key: string;
  label: string;
  /** [value, label] pairs. The server passes the choices that make sense for the other filters already chosen. */
  options: [string, string][];
  /** Label of the "no filter" choice, e.g. "All year levels". */
  all: string;
  /** Other filters to clear when this one changes (e.g. the semester when the school year changes). */
  resets?: string[];
  /** Shown instead of the choices when the filter cannot be used yet (e.g. "Choose a school year first"). */
  disabledText?: string;
};

/**
 * The shared filter bar, working like User Management's: every choice applies at once (no Filter button), search applies
 * when typing pauses, active filters show as chips that remove themselves with one click, and Clear all resets them.
 * Everything lives in the URL, so a filtered list survives paging and reloads and can be shared as a link; the server
 * reads the same parameters and does the filtering, so this bar is only a way to set them.
 */
export function FilterBar({ search, selects, dates = [], label = "Filters", note }: {
  search?: { key?: string; label?: string; placeholder: string };
  selects: FilterSelect[];
  /** Date fields (YYYY-MM-DD), e.g. a From / To range. Applied as soon as a date is picked. */
  dates?: { key: string; label: string; max?: string }[];
  label?: string;
  note?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();
  const [pending, start] = useTransition();
  // The latest choices, even before the page has finished reloading for the previous one, so quick changes in a row
  // build on each other instead of overwriting each other. Cleared once the address catches up.
  const [latest, setLatest] = useState<string | null>(null);
  const sp = latest !== null && latest !== urlParams.toString() ? new URLSearchParams(latest) : urlParams;
  const qKey = search?.key ?? "q";
  const [q, setQ] = useState(sp.get(qKey) ?? "");
  const lastPushed = useRef(sp.get(qKey) ?? "");

  const set = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, val] of Object.entries(changes)) { if (val) p.set(k, val); else p.delete(k); }
    p.delete("page"); // a new filter starts from the first page
    const s = p.toString();
    setLatest(s);
    start(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };

  // Search applies 350 ms after typing stops.
  useEffect(() => {
    if (!search) return;
    const t = setTimeout(() => {
      const trimmed = q.trim();
      if (trimmed !== lastPushed.current) { lastPushed.current = trimmed; set({ [qKey]: trimmed || null }); }
    }, 350);
    return () => clearTimeout(t);
  });

  const chips = [
    ...(search && sp.get(qKey) ? [{ key: qKey, text: `“${sp.get(qKey)}”`, resets: [] as string[] }] : []),
    ...selects.filter((f) => sp.get(f.key)).map((f) => ({
      key: f.key, resets: f.resets ?? [],
      text: `${f.label}: ${f.options.find(([v]) => v === sp.get(f.key))?.[1] ?? sp.get(f.key)}`,
    })),
    ...dates.filter((d) => sp.get(d.key)).map((d) => ({ key: d.key, resets: [] as string[], text: `${d.label}: ${sp.get(d.key)}` })),
  ];
  const remove = (key: string, resets: string[]) => {
    if (key === qKey) { setQ(""); lastPushed.current = ""; }
    set(Object.fromEntries([key, ...resets].map((k) => [k, null])));
  };
  const clearAll = () => {
    setQ(""); lastPushed.current = "";
    set(Object.fromEntries([qKey, ...selects.map((f) => f.key), ...selects.flatMap((f) => f.resets ?? []), ...dates.map((d) => d.key)].map((k) => [k, null])));
  };
  const id = (k: string) => `fb-${k}`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card print:hidden" aria-busy={pending}>
      <div role="search" aria-label={label} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {search && (
          <div className="sm:col-span-2">
            <label htmlFor={id(qKey)} className="mb-1 block text-xs font-medium text-muted">{search.label ?? "Search"}</label>
            <input id={id(qKey)} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={search.placeholder} className={inputClass} />
          </div>
        )}
        {selects.map((f) => {
          const disabled = !!f.disabledText && f.options.length === 0;
          return (
            <div key={f.key}>
              <label htmlFor={id(f.key)} className="mb-1 block text-xs font-medium text-muted">{f.label}</label>
              <select id={id(f.key)} value={sp.get(f.key) ?? ""} disabled={disabled}
                onChange={(e) => set({ [f.key]: e.target.value || null, ...Object.fromEntries((f.resets ?? []).map((k) => [k, null])) })}
                className={inputClass}>
                <option value="">{disabled ? f.disabledText : f.all}</option>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          );
        })}
        {dates.map((d) => (
          <div key={d.key}>
            <label htmlFor={id(d.key)} className="mb-1 block text-xs font-medium text-muted">{d.label}</label>
            <input id={id(d.key)} type="date" value={sp.get(d.key) ?? ""} max={d.max} onChange={(e) => set({ [d.key]: e.target.value || null })} className={inputClass} />
          </div>
        ))}
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Active filters:</span>
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={() => remove(c.key, c.resets)} aria-label={`Remove filter ${c.text}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary hover:bg-primary-soft/70">
              {c.text}<span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" onClick={clearAll} className="text-xs font-medium text-primary hover:underline">Clear all</button>
          {pending ? <span className="text-xs text-muted" role="status">Updating…</span> : null}
        </div>
      ) : pending ? <span className="text-xs text-muted" role="status">Updating…</span> : null}
      {note ? <div className="text-xs text-muted">{note}</div> : null}
    </div>
  );
}
