import Link from "next/link";
import { inputClass, secondaryButton } from "@/components/shared/ui";

const TABS = [
  ["/fees/manage", "Fees & collections"],
  ["/fees/expenses", "Expenses & funds"],
  ["/fees/report", "Financial report"],
  ["/fees/audit", "Audit trail"],
] as const;

/** Tabs shared by the organization finance pages, keeping the selected organization. */
export function FinanceNav({ current, orgId }: { current: (typeof TABS)[number][0]; orgId?: string }) {
  return (
    <nav aria-label="Finance sections" className="flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1 shadow-card">
      {TABS.map(([href, label]) => (
        <Link key={href} href={orgId ? `${href}?org=${orgId}` : href} aria-current={current === href ? "page" : undefined}
          className={`rounded-xl px-4 py-2 text-sm font-medium ${current === href ? "bg-primary text-white" : "text-muted hover:bg-primary-soft hover:text-primary"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Organization picker for people with finance access in more than one organization. */
export function OrgPicker({ orgId, options, extra }: { orgId: string; options: { id: string; name: string }[]; extra?: Record<string, string | undefined> }) {
  if (options.length < 2) return null;
  return (
    <form className="flex gap-2">
      {Object.entries(extra ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <select name="org" defaultValue={orgId} aria-label="Organization" className={`${inputClass} max-w-xs`}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <button type="submit" className={secondaryButton}>Switch</button>
    </form>
  );
}
