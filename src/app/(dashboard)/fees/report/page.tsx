import { FilterBar } from "@/components/shared/filter-bar";
import { Badge, ButtonLink, Card, inputClass, Page, PageHeader, secondaryButton, Table, Td } from "@/components/shared/ui";
import { canOrg, orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDate, formatPeso } from "@/lib/format";
import { isYmd, periodReport, todayManila } from "@/features/finance/funds";
import { FinanceNav, OrgPicker } from "@/features/finance/finance-nav";
import { cashOnHand, feeBreakdowns, membershipPotential, transactions, type TxStatus } from "@/features/finance/overview";
import { filterLabel, filterParams, parseFinanceFilter, termOptions, termSelects } from "@/features/fees/filters";

// Signed-in page (reads the session and organization finances on every request).
export const instant = false;

type Sp = { org?: string; from?: string; to?: string; sy?: string; sem?: string; yl?: string; tx?: string };
type Breakdown = { label: string; charged: string; collected: string; outstanding: string; count: number };
const TX: [TxStatus, string, "green" | "amber" | "red" | "gray"][] = [["confirmed", "Confirmed", "green"], ["pending", "Pending", "amber"], ["rejected", "Rejected", "red"], ["returned", "Returned", "gray"]];

const Money = ({ v, tone = "" }: { v: string; tone?: string }) => <span className={`tabular-nums ${tone}`}>{formatPeso(v)}</span>;

function BreakdownCard({ title, column, rows, kinds }: { title: string; column: string; rows: Breakdown[]; kinds?: string[] }) {
  return (
    <Card title={title} className="min-w-0">
      {rows.length === 0 ? <p className="text-sm text-muted">No fees in this view.</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="py-2 font-semibold">{column}</th><th className="py-2 text-right font-semibold">Charged</th><th className="py-2 text-right font-semibold">Collected</th><th className="py-2 text-right font-semibold">Outstanding</th></tr></thead>
          <tbody>{rows.map((x, i) => (
            <tr key={x.label + i} className="border-t border-border">
              <td className="py-2">{x.label}{kinds?.[i] && <span className="ml-1 text-xs text-muted">({kinds[i]})</span>}<span className="block text-xs text-muted">{x.count} charge{x.count === 1 ? "" : "s"}</span></td>
              <td className="py-2 text-right"><Money v={x.charged} /></td>
              <td className="py-2 text-right"><Money v={x.collected} tone="text-success" /></td>
              <td className="py-2 text-right"><Money v={x.outstanding} tone={Number(x.outstanding) > 0 ? "text-danger" : ""} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  );
}

export default async function FinanceReportPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requireOrgPermissionAnywhere("fees.view_org");
  const sp = await searchParams;
  const viewIds = orgIdsWith(user, "fees.view_org");
  const names = new Map(user.memberships.map((m) => [m.organizationId, m.organizationName]));
  const orgId = viewIds.includes(sp.org ?? "") ? sp.org! : viewIds[0];
  const today = todayManila();
  const to = isYmd(sp.to ?? "") ? sp.to! : today;
  const from = isYmd(sp.from ?? "") && sp.from! <= to ? sp.from! : `${to.slice(0, 7)}-01`;
  const filter = parseFinanceFilter(sp);
  const txStatus = TX.find(([k]) => k === sp.tx)?.[0] ?? null;
  const [r, terms, potential, breakdown, cash, history] = await Promise.all([
    periodReport(orgId, from, to), termOptions(), membershipPotential(orgId, filter), feeBreakdowns(orgId, filter), cashOnHand(orgId), transactions(orgId, txStatus),
  ]);
  const canExport = canOrg(user, "reports.finance", orgId);
  const view = filterLabel(filter, terms);
  const keep: Record<string, string | undefined> = { org: orgId, from, to, ...filterParams(filter) };
  const txHref = (tx: string | null) => `?${new URLSearchParams(Object.entries({ ...keep, tx: tx ?? undefined }).filter((e): e is [string, string] => !!e[1])).toString()}`;
  const pill = (active: boolean) => `rounded-lg px-3 py-1 text-sm ${active ? "bg-surface font-medium text-primary shadow-sm" : "text-muted hover:bg-surface"}`;

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

      {/* Summary: every figure below comes from the records; nothing is typed in by hand. */}
      <section aria-labelledby="summary" className="flex flex-col gap-3">
        <h2 id="summary" className="text-lg font-semibold">Summary</h2>
        <FilterBar label="Filter the report" selects={termSelects(terms, filter, { yearLevel: true })} />
        <p className="text-sm text-muted">Fee figures show <strong className="text-foreground">{view}</strong>. Cash on hand always covers all time.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card title="Membership fees expected"><p className="text-2xl font-semibold"><Money v={breakdown.membership.charged} /></p><p className="text-xs text-muted">Charged to members · possible <Money v={potential.totals.potential} /></p></Card>
          <Card title="Membership fees collected"><p className="text-2xl font-semibold text-success"><Money v={breakdown.membership.collected} /></p><p className="text-xs text-muted">Outstanding <Money v={breakdown.membership.outstanding} /></p></Card>
          <Card title="All fees outstanding"><p className="text-2xl font-semibold text-danger"><Money v={breakdown.all.outstanding} /></p><p className="text-xs text-muted">of <Money v={breakdown.all.charged} /> charged · <Money v={breakdown.all.collected} /> collected</p></Card>
          <Card title="Cash on hand"><p className="text-2xl font-semibold text-primary"><Money v={cash.available} /></p><p className="text-xs text-muted">Approved collections <Money v={cash.inflows} /> − approved expenses <Money v={cash.expenses} /></p></Card>
        </div>
      </section>

      <section aria-labelledby="potential" className="flex flex-col gap-3">
        <h2 id="potential" className="text-lg font-semibold">A. Possible membership fee collection</h2>
        <p className="text-sm text-muted">What the membership fee would bring in if every eligible member paid: eligible members × the membership fees set for that semester. It is a projection, not money received. Set the amount with <strong className="text-foreground">+ Create fee</strong> (type “Membership fee”) on Fees &amp; collections; the fee belongs to the semester that is current when you create it.</p>
        {potential.rows.length === 0 ? <Card><p className="text-sm text-muted">No semesters in this view. Add the school year and semesters under Academic Setup.</p></Card> : (
          <Table head={["Semester", "Membership fee", "Eligible members", "Possible collection", "Charged", "Collected", "Outstanding"]}>
            {potential.rows.map((p) => (
              <tr key={p.semesterId}>
                <Td><span className="font-medium">{p.label}</span>{p.active && <span className="ml-2"><Badge tone="purple">Current</Badge></span>}</Td>
                <Td>{p.fees.length ? p.fees.map((f) => <div key={f.name}>{f.name} · {formatPeso(f.amount)}{!f.active ? " (inactive)" : ""}</div>) : <span className="text-muted">Not set</span>}</Td>
                <Td className="tabular-nums">{p.eligibleMembers}{p.notYetCharged > 0 && p.fees.length > 0 && <div className="text-xs text-warning">{p.notYetCharged} not charged yet</div>}</Td>
                <Td><Money v={p.potential} /><div className="text-xs text-muted">{formatPeso(p.perMember)} each</div></Td>
                <Td><Money v={p.charged} /></Td>
                <Td><Money v={p.collected} tone="text-success" /></Td>
                <Td><Money v={p.outstanding} tone={Number(p.outstanding) > 0 ? "text-danger" : ""} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section aria-labelledby="cash" className="flex flex-col gap-3">
        <h2 id="cash" className="text-lg font-semibold">B. Total cash on hand</h2>
        <Card>
          <div className="flex flex-col">
            {line("Member fee payments (confirmed)", cash.collected, { sign: "+", tone: "text-success" })}
            {line("Other money received (approved)", cash.otherIncome, { sign: "+", tone: "text-success" })}
            {line("Expenses (approved)", cash.expenses, { sign: "−", tone: "text-danger" })}
            {line("Cash on hand", cash.available, { strong: true })}
          </div>
          <p className="mt-3 text-xs text-muted">Calculated from the records, never typed in. Not counted: payments waiting for verification, rejected or voided payments, and expenses or income that are pending ({cash.pendingExpenseCount + cash.pendingIncomeCount} now), rejected, cancelled or returned.</p>
        </Card>
      </section>

      <section aria-labelledby="breakdown" className="flex flex-col gap-3">
        <h2 id="breakdown" className="text-lg font-semibold">C. Breakdown</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownCard title="By semester" column="Semester" rows={breakdown.bySemester} />
          <BreakdownCard title="By year level" column="Year level" rows={breakdown.byYearLevel} />
        </div>
        <BreakdownCard title="By fee" column="Fee" rows={breakdown.byFee} kinds={breakdown.byFee.map((x) => x.kind)} />
      </section>

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <h2 id="history" className="text-lg font-semibold">Transaction history</h2>
        <nav aria-label="Transaction status" className="flex flex-wrap gap-2">
          <a href={txHref(null)} aria-current={!txStatus ? "page" : undefined} className={pill(!txStatus)}>All</a>
          {TX.map(([k, label]) => <a key={k} href={txHref(k)} aria-current={txStatus === k ? "page" : undefined} className={pill(txStatus === k)}>{label}</a>)}
        </nav>
        {history.length === 0 ? <Card><p className="text-sm text-muted">No transactions{txStatus ? " with this status" : ""}.</p></Card> : (
          <Table head={["Date", "Type", "Details", "Amount", "Status"]}>
            {history.map((t) => {
              const st = TX.find(([k]) => k === t.status)!;
              return (
                <tr key={`${t.kind}-${t.id}`}>
                  <Td>{formatDate(t.at)}</Td>
                  <Td>{t.kind}</Td>
                  <Td>{t.title}{t.detail && <div className="text-xs text-muted">{t.detail}</div>}{t.note && <div className="text-xs text-muted">“{t.note}”</div>}</Td>
                  <Td className={`tabular-nums ${t.status === "confirmed" ? (t.direction === "in" ? "text-success" : "text-danger") : "text-muted line-through decoration-1"}`}>{t.direction === "in" ? "+" : "−"}{formatPeso(t.amount)}</Td>
                  <Td><Badge tone={st[2]}>{st[1]}</Badge></Td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="text-xs text-muted">The latest 60. Only confirmed amounts count; the others are struck through. Returned means a voided payment, or an approved expense or income that was marked as returned.</p>
      </section>

      <h2 className="text-lg font-semibold">Statement for a period</h2>

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
      <p className="text-sm text-muted">Only confirmed fee payments and approved records count. Pending, rejected, cancelled and returned records never change the balance. Outstanding member fees are money owed, not money held, so they are not part of this statement.</p>
    </Page>
  );
}
