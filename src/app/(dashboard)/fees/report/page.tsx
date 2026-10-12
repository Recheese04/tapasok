import { ButtonLink, Card, inputClass, Page, PageHeader, secondaryButton, Table, Td } from "@/components/shared/ui";
import { canOrg, orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatPeso } from "@/lib/format";
import { isYmd, periodReport, todayManila } from "@/features/finance/funds";
import { FinanceNav, OrgPicker } from "@/features/finance/finance-nav";

// Signed-in page (reads the session and organization finances on every request).
export const instant = false;

export default async function FinanceReportPage({ searchParams }: { searchParams: Promise<{ org?: string; from?: string; to?: string }> }) {
  const user = await requireOrgPermissionAnywhere("fees.view_org");
  const sp = await searchParams;
  const viewIds = orgIdsWith(user, "fees.view_org");
  const names = new Map(user.memberships.map((m) => [m.organizationId, m.organizationName]));
  const orgId = viewIds.includes(sp.org ?? "") ? sp.org! : viewIds[0];
  const today = todayManila();
  const to = isYmd(sp.to ?? "") ? sp.to! : today;
  const from = isYmd(sp.from ?? "") && sp.from! <= to ? sp.from! : `${to.slice(0, 7)}-01`;
  const r = await periodReport(orgId, from, to);
  const canExport = canOrg(user, "reports.finance", orgId);

  const line = (label: string, value: string, opts: { strong?: boolean; sign?: "+" | "−"; tone?: string } = {}) => (
    <div className={`flex items-center justify-between gap-4 py-2.5 ${opts.strong ? "border-t-2 border-foreground/80 pt-3 text-base font-semibold" : "border-t border-border text-sm"}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${opts.tone ?? ""}`}>{opts.sign ?? ""}{formatPeso(value)}</span>
    </div>
  );

  return (
    <Page>
      <PageHeader
        title="Financial report"
        subtitle={`${names.get(orgId)} · money received, money spent and the resulting balance for a period.`}
        actions={canExport ? <ButtonLink href={`/fees/report/export?org=${orgId}&from=${from}&to=${to}`} variant="secondary">Download CSV</ButtonLink> : undefined}
      />
      <FinanceNav current="/fees/report" orgId={orgId} />
      <OrgPicker orgId={orgId} options={viewIds.map((id) => ({ id, name: names.get(id) ?? id }))} extra={{ from, to }} />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card" aria-label="Report period">
        <input type="hidden" name="org" value={orgId} />
        <label className="flex flex-col gap-1 text-sm font-medium">From<input type="date" name="from" defaultValue={from} max={today} className={inputClass} /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">To<input type="date" name="to" defaultValue={to} max={today} className={inputClass} /></label>
        <button type="submit" className={secondaryButton}>Show period</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card title={`Statement · ${from} to ${to}`}>
          <div className="flex flex-col">
            {line("Opening balance", r.opening, { strong: false })}
            {line("Member fee collections (confirmed)", r.collections, { sign: "+", tone: "text-success" })}
            {line("Other funds received (approved)", r.otherIncome, { sign: "+", tone: "text-success" })}
            {line("Expenses (approved)", r.spent, { sign: "−", tone: "text-danger" })}
            {line("Closing balance", r.closing, { strong: true })}
          </div>
          <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${r.reconciles ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`} role="status">
            {r.reconciles ? "Reconciled: opening + received − spent equals the balance calculated directly from all records up to this date." : "Does not reconcile. Check the audit trail for records dated outside their period."}
          </p>
        </Card>
        <Card title="By category (approved)">
          {r.categories.length === 0 ? <p className="text-sm text-muted">No approved expenses or other funds in this period.</p> : (
            <Table head={["Category", "Records", "Amount"]}>
              {r.categories.map((c) => (
                <tr key={`${c.type}-${c.category}`} className="border-t border-border">
                  <Td>{c.label} <span className="text-xs text-muted">({c.type === "EXPENSE" ? "spent" : "received"})</span></Td>
                  <Td className="tabular-nums">{c.count}</Td>
                  <Td className={`tabular-nums font-medium ${c.type === "EXPENSE" ? "text-danger" : "text-success"}`}>{c.type === "EXPENSE" ? "−" : "+"}{formatPeso(c.amount)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
      <p className="text-sm text-muted">Only confirmed fee payments and approved records count. Pending, rejected, cancelled and reversed records never change the balance. Outstanding member fees are money owed, not money held, so they are not part of this statement.</p>
    </Page>
  );
}
