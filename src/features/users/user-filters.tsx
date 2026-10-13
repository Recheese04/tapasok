"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "@/components/shared/ui";

type Tree = { id: string; code: string; name: string; departments: { id: string; name: string; programs: { id: string; code: string; name: string }[] }[] }[];
type Opt = { id: string; name: string };

const TYPES: [string, string][] = [["STUDENT", "Students"], ["STAFF", "Faculty / staff"], ["ACCOUNT_ONLY", "Account only"]];
const STATUSES: [string, string][] = [["ACTIVE", "Active"], ["INVITED", "Awaiting setup"], ["DISABLED", "Deactivated"]];
const PRIVS: [string, string][] = [["SYSTEM_ADMIN", "System administrators"], ["USER", "Regular accounts"]];
const yearName = (y: string) => (y === "none" ? "Unassigned" : `Year ${y}`);

/**
 * Filters for User Management. Every change goes into the URL (so filters survive paging, sorting and reloads) and the
 * server applies them. Search waits until typing pauses. Department choices follow the college, programs follow the
 * department, and year levels follow the program (only levels that students actually have).
 */
export function UserFilterBar({ tree, orgs, roles, years }: { tree: Tree; orgs: Opt[]; roles: [string, string][]; years: { byProgram: Record<string, string[]>; all: string[] } }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const lastPushed = useRef(sp.get("q") ?? "");

  const v = (k: string) => sp.get(k) ?? "";
  const college = v("college"), dept = v("dept"), program = v("program");
  const departments = college ? tree.find((c) => c.id === college)?.departments ?? [] : tree.flatMap((c) => c.departments);
  const programs = dept ? departments.find((d) => d.id === dept)?.programs ?? [] : departments.flatMap((d) => d.programs);
  const yearOptions = program ? years.byProgram[program] ?? [] : years.all;

  const set = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, val] of Object.entries(changes)) { if (val) p.set(k, val); else p.delete(k); }
    p.delete("page"); // a new filter starts from the first page
    const s = p.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };

  // Debounced search: apply 350 ms after typing stops.
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = q.trim();
      if (trimmed !== lastPushed.current) { lastPushed.current = trimmed; set({ q: trimmed || null }); }
    }, 350);
    return () => clearTimeout(t);
  });

  const label = (k: string, val: string): string => {
    switch (k) {
      case "type": return TYPES.find(([x]) => x === val)?.[1] ?? val;
      case "status": return STATUSES.find(([x]) => x === val)?.[1] ?? val;
      case "priv": return PRIVS.find(([x]) => x === val)?.[1] ?? val;
      case "college": return tree.find((c) => c.id === val)?.code ?? "College";
      case "dept": return tree.flatMap((c) => c.departments).find((d) => d.id === val)?.name ?? "Department";
      case "program": return val === "none" ? "No program" : tree.flatMap((c) => c.departments.flatMap((d) => d.programs)).find((p) => p.id === val)?.code ?? "Program";
      case "year": return yearName(val);
      case "org": return orgs.find((o) => o.id === val)?.name ?? "Organization";
      case "role": return roles.find(([x]) => x === val)?.[1] ?? val;
      case "q": return `“${val}”`;
      default: return val;
    }
  };
  // Removing a parent filter also removes the filters that depend on it.
  const dependents: Record<string, string[]> = { college: ["dept", "program", "year"], dept: ["program", "year"], program: ["year"] };
  const remove = (k: string) => {
    if (k === "q") { setQ(""); lastPushed.current = ""; }
    set(Object.fromEntries([k, ...(dependents[k] ?? [])].map((x) => [x, null])));
  };
  const active = ["q", "type", "status", "priv", "college", "dept", "program", "year", "org", "role"].filter((k) => sp.get(k));

  const select = (id: string, labelText: string, k: string, options: [string, string][], all: string, extra?: Record<string, string | null>, disabled = false) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{labelText}</label>
      <select id={id} value={v(k)} disabled={disabled} onChange={(e) => set({ [k]: e.target.value || null, ...extra })} className={inputClass}>
        <option value="">{all}</option>
        {options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
      </select>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card" aria-busy={pending}>
      <div role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <div className="sm:col-span-2">
          <label htmlFor="uf-q" className="mb-1 block text-xs font-medium text-muted">Search</label>
          <input id="uf-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, student no. or employee ID" className={inputClass} />
        </div>
        {select("uf-type", "Account type", "type", TYPES, "All types")}
        {select("uf-status", "Status", "status", STATUSES, "All statuses")}
        {select("uf-priv", "Privileges", "priv", PRIVS, "Any privileges")}
        {select("uf-college", "College", "college", tree.map((c) => [c.id, `${c.code} — ${c.name}`]), "All colleges", { dept: null, program: null, year: null })}
        {select("uf-dept", "Department", "dept", departments.map((d) => [d.id, college ? d.name : `${tree.find((c) => c.departments.some((x) => x.id === d.id))?.code} · ${d.name}`]), "All departments", { program: null, year: null })}
        {select("uf-program", "Program", "program", [...programs.map((p): [string, string] => [p.id, `${p.code} — ${p.name}`]), ["none", "No program (unassigned)"]], "All programs", { year: null })}
        {select("uf-year", "Year level", "year", yearOptions.map((y): [string, string] => [y, yearName(y)]), program && yearOptions.length === 0 ? "No students in this program" : "All year levels", undefined, !!program && yearOptions.length === 0)}
        {select("uf-org", "Organization", "org", orgs.map((o) => [o.id, o.name]), "All organizations")}
        {select("uf-role", "Position", "role", roles, "Any position")}
      </div>
      {active.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Active filters:</span>
          {active.map((k) => (
            <button key={k} type="button" onClick={() => remove(k)} aria-label={`Remove filter ${label(k, v(k))}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary hover:bg-primary-soft/70">
              {label(k, v(k))}<span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" onClick={() => { setQ(""); lastPushed.current = ""; set(Object.fromEntries(active.map((k) => [k, null]))); }} className="text-xs font-medium text-primary hover:underline">Clear all</button>
          {pending ? <span className="text-xs text-muted" role="status">Updating…</span> : null}
        </div>
      ) : pending ? <span className="text-xs text-muted" role="status">Updating…</span> : null}
    </div>
  );
}
