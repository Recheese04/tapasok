import { EmptyState } from "@/components/shared/empty-state";
import { Badge, inputClass, Page, PageHeader, secondaryButton, Table, Td } from "@/components/shared/ui";
import { orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDateTime, formatPeso } from "@/lib/format";
import { isYmd, listAudit } from "@/features/finance/funds";
import { FinanceNav, OrgPicker } from "@/features/finance/finance-nav";

// Signed-in page (reads the session and organization finances on every request).
export const instant = false;

const TYPES: [string, string][] = [["", "All records"], ["fund_transaction", "Expenses & other funds"], ["payment", "Payments"], ["fee_type", "Fees"], ["student_fee", "Ledger adjustments"], ["report", "Reports"]];
const TONE = (action: string) => (/reject|void|reverse|cancel|delete/.test(action) ? "red" : /approve|confirm|record/.test(action) ? "green" : /submit|edit|update|adjust/.test(action) ? "amber" : "gray") as "red" | "green" | "amber" | "gray";
const pretty = (a: string) => a.replace(/_/g, " ").replace(".", " · ");

function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>, a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !(b[k] == null && a[k] == null));
  if (!keys.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {keys.map((k) => {
        const changed = k in b && k in a && JSON.stringify(b[k]) !== JSON.stringify(a[k]);
        return (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="break-all">{k in b && changed ? <><span className="text-danger line-through">{String(b[k])}</span> → </> : null}{k in a ? String(a[k]) : <span className="text-muted">{String(b[k])}</span>}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Append-only history of every financial action. Read-only for everyone with finance access, including the Auditor. */
export default async function FinancialAuditPage({ searchParams }: { searchParams: Promise<{ org?: string; type?: string; from?: string; to?: string }> }) {
  const user = await requireOrgPermissionAnywhere("fees.view_org");
  const sp = await searchParams;
  const viewIds = orgIdsWith(user, "fees.view_org");
  const names = new Map(user.memberships.map((m) => [m.organizationId, m.organizationName]));
  const orgId = viewIds.includes(sp.org ?? "") ? sp.org! : viewIds[0];
  const type = TYPES.some(([v]) => v && v === sp.type) ? sp.type : undefined;
  const from = isYmd(sp.from ?? "") ? sp.from : undefined, to = isYmd(sp.to ?? "") ? sp.to : undefined;
  const rows = await listAudit(orgId, { entityType: type, from, to });

  return (
    <Page>
      <PageHeader title="Financial audit trail" subtitle={`${names.get(orgId)} · every financial action, who did it and when. Entries cannot be edited or deleted.`} />
      <FinanceNav current="/fees/audit" orgId={orgId} />
      <OrgPicker orgId={orgId} options={viewIds.map((id) => ({ id, name: names.get(id) ?? id }))} />
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card" aria-label="Filter audit trail">
        <input type="hidden" name="org" value={orgId} />
        <select name="type" defaultValue={type ?? ""} aria-label="Record type" className={`${inputClass} max-w-xs`}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input type="date" name="from" defaultValue={from} aria-label="From" className={`${inputClass} max-w-[11rem]`} />
        <input type="date" name="to" defaultValue={to} aria-label="To" className={`${inputClass} max-w-[11rem]`} />
        <button type="submit" className={secondaryButton}>Apply</button>
      </form>
      {rows.length === 0 ? <EmptyState title="No financial activity yet" hint="Fees, payments, expenses and approvals will appear here as they happen." /> : (
        <Table head={["When", "Action", "Amount", "By", "Details", "Reason"]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border align-top">
              <Td className="whitespace-nowrap text-xs">{formatDateTime(new Date(r.at))}</Td>
              <Td><Badge tone={TONE(r.action)}>{pretty(r.action)}</Badge></Td>
              <Td className="whitespace-nowrap tabular-nums">{r.amount ? formatPeso(r.amount) : "—"}</Td>
              <Td className="whitespace-nowrap">{r.actor}</Td>
              <Td className="min-w-[14rem]"><Diff before={r.before} after={r.after} /></Td>
              <Td className="max-w-[16rem] text-xs">{r.reason ?? ""}</Td>
            </tr>
          ))}
        </Table>
      )}
      <p className="text-sm text-muted">Showing the latest 200 entries for the filter. Corrections never change past entries; they add a new one (an edit, reversal, void or adjustment).</p>
    </Page>
  );
}
