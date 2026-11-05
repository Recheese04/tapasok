import { FilterBar } from "@/components/shared/filter-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge, ButtonLink, Card, Page, PageHeader } from "@/components/shared/ui";
import { canOrg, orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatPeso } from "@/lib/format";
import { FinanceNav, OrgPicker } from "@/features/finance/finance-nav";
import { filterLabel, filterParams, parseFinanceFilter, termOptions, termSelects } from "@/features/fees/filters";
import { masterlist, type CellStatus, type MasterlistStatus } from "@/features/fees/masterlist";
import { PrintButton } from "@/features/fees/print-button";

// Signed-in page (reads the session and organization finances on every request).
export const instant = false;

type Sp = { org?: string; sy?: string; sem?: string; yl?: string; q?: string; status?: string };
const TONE: Record<CellStatus, "green" | "amber" | "red" | "gray"> = { PAID: "green", PARTIAL: "amber", UNPAID: "red", CREDIT: "gray" };
const LABEL: Record<CellStatus, string> = { PAID: "Paid", PARTIAL: "Partial", UNPAID: "Unpaid", CREDIT: "Overpaid" };
const STATUSES: [MasterlistStatus, string][] = [["all", "Everyone"], ["paid", "Fully paid"], ["balance", "With balance"], ["none", "Nothing assessed"]];

/** Every member's fees in one table, by school year, semester and year level (fees.view_org). */
export default async function MasterlistPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requireOrgPermissionAnywhere("fees.view_org");
  const sp = await searchParams;
  const viewIds = orgIdsWith(user, "fees.view_org");
  const names = new Map(user.memberships.map((m) => [m.organizationId, m.organizationName]));
  const orgId = viewIds.includes(sp.org ?? "") ? sp.org! : viewIds[0];
  const filter = parseFinanceFilter(sp);
  const status = STATUSES.some(([k]) => k === sp.status) ? (sp.status as MasterlistStatus) : "all";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const [terms, list] = await Promise.all([termOptions(), masterlist(orgId, filter, { q, status })]);
  const canExport = canOrg(user, "reports.finance", orgId);
  const exportQuery = new URLSearchParams(Object.entries({ org: orgId, ...filterParams(filter), q: q || undefined, status: status === "all" ? undefined : status }).filter((e): e is [string, string] => !!e[1])).toString();

  return (
    <Page>
      <PageHeader
        title="Fees masterlist"
        subtitle={`${names.get(orgId)} · ${filterLabel(filter, terms)} · every member's fees and payments in one table.`}
        actions={<><PrintButton />{canExport && <ButtonLink href={`/fees/masterlist/export?${exportQuery}`} variant="secondary">Download CSV</ButtonLink>}</>}
      />
      <div className="print:hidden"><FinanceNav current="/fees/masterlist" orgId={orgId} /></div>
      <div className="flex flex-col gap-3 print:hidden">
        <OrgPicker orgId={orgId} options={viewIds.map((id) => ({ id, name: names.get(id) ?? id }))} />
        <FilterBar label="Filter the masterlist"
          search={{ placeholder: "Name or student number" }}
          selects={[
            ...termSelects(terms, filter, { yearLevel: true }),
            { key: "status", label: "Payment status", all: "Everyone", options: STATUSES.filter(([k]) => k !== "all") },
          ]} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="Members"><p className="text-2xl font-semibold">{list.counts.members}</p><p className="text-xs text-muted">{list.counts.notAssessed} with nothing assessed</p></Card>
        <Card title="Fully paid"><p className="text-2xl font-semibold text-success">{list.counts.fullyPaid}</p><p className="text-xs text-muted">of {list.counts.members - list.counts.notAssessed} assessed</p></Card>
        <Card title="With balance"><p className="text-2xl font-semibold text-danger">{list.counts.withBalance}</p><p className="text-xs text-muted">Unpaid or partly paid</p></Card>
        <Card title="Collected"><p className="text-2xl font-semibold">{formatPeso(list.totals.paid.toString())}</p><p className="text-xs text-muted">of {formatPeso(list.totals.due.toString())} · {formatPeso(list.totals.balance.toString())} outstanding</p></Card>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title={q || status !== "all" || filter.yl !== null ? "No members match these filters" : "No members yet"} hint="Try another school year, semester or year level." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card print:overflow-visible print:shadow-none">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Fees masterlist: one row per member, one column per fee</caption>
            <thead className="bg-sidebar/70 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-sidebar px-3 py-3 font-semibold">#</th>
                <th scope="col" className="sticky left-8 z-10 bg-sidebar px-3 py-3 font-semibold">Member</th>
                <th scope="col" className="px-3 py-3 font-semibold">Year</th>
                {list.columns.map((c) => (
                  <th key={c.key} scope="col" className="px-3 py-3 text-right font-semibold normal-case">
                    <span className="block text-xs uppercase">{c.label}</span>
                    {c.amount && <span className="block font-normal text-muted">{formatPeso(c.amount)}</span>}
                  </th>
                ))}
                <th scope="col" className="px-3 py-3 text-right font-semibold">Paid</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Balance</th>
                <th scope="col" className="px-3 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="[&>tr:hover]:bg-primary-soft/30">
              {list.rows.map((r, i) => (
                <tr key={r.userId} className="border-b border-border last:border-b-0">
                  <td className="sticky left-0 bg-surface px-3 py-2.5 tabular-nums text-muted">{i + 1}</td>
                  <th scope="row" className="sticky left-8 min-w-44 whitespace-nowrap bg-surface px-3 py-2.5 text-left font-medium">
                    {r.name}
                    <span className="block text-xs font-normal text-muted">{[r.studentNumber, r.program].filter(Boolean).join(" · ") || "No student profile"}</span>
                  </th>
                  <td className="px-3 py-2.5 tabular-nums">{r.yearLevel ?? "—"}</td>
                  {list.columns.map((c) => {
                    const cell = r.cells[c.key];
                    return (
                      <td key={c.key} className="px-3 py-2.5 text-right tabular-nums">
                        {cell ? (
                          <>
                            <span className="block">{formatPeso(cell.paid.toString())}</span>
                            <span className={`block text-xs ${cell.balance.gt(0) ? "text-danger" : "text-success"}`}>{cell.balance.gt(0) ? `${formatPeso(cell.balance.toString())} left` : LABEL[cell.status]}</span>
                          </>
                        ) : <span className="text-muted" title="Not assessed">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatPeso(r.paid.toString())}</td>
                  <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${r.balance.gt(0) ? "text-danger" : ""}`}>{formatPeso(r.balance.toString())}</td>
                  <td className="px-3 py-2.5">{r.status ? <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge> : <span className="text-xs text-muted">Nothing assessed</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-foreground/70 bg-sidebar/40 text-sm font-semibold">
              <tr>
                <td className="sticky left-0 bg-sidebar px-3 py-3" />
                <th scope="row" className="sticky left-8 bg-sidebar px-3 py-3 text-left">Total ({list.rows.length})</th>
                <td className="px-3 py-3" />
                {list.columns.map((c) => {
                  const t = list.columnTotals[c.key];
                  return (
                    <td key={c.key} className="px-3 py-3 text-right tabular-nums">
                      <span className="block">{formatPeso(t.paid.toString())}</span>
                      <span className="block text-xs font-normal text-muted">{t.paidCount}/{t.count} paid</span>
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-right tabular-nums">{formatPeso(list.totals.paid.toString())}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatPeso(list.totals.balance.toString())}</td>
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-muted print:hidden">Amounts follow the ledger: amount due plus adjustments, minus confirmed payments. Payments waiting for verification are not counted yet. Advisers are not listed because they are not assessed fees.</p>
    </Page>
  );
}
