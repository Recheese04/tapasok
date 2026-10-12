import { EmptyState } from "@/components/shared/empty-state";
import { ModalButton } from "@/components/shared/modal";
import { Badge, inputClass, Page, PageHeader, secondaryButton, StatCard, Table, Td } from "@/components/shared/ui";
import { Icon } from "@/components/layout/icons";
import type { FundCategory } from "@/generated/prisma/enums";
import { canOrg, orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDate, formatPeso } from "@/lib/format";
import { CATEGORY_LABEL, EXPENSE_CATEGORIES, fundSummary, INCOME_CATEGORIES, isYmd, listFunds, type FundFilter } from "@/features/finance/funds";
import { DecideFundForm, EditFundForm, RecordFundForm } from "@/features/finance/forms";
import { FinanceNav, OrgPicker } from "@/features/finance/finance-nav";
import { orgFinance } from "@/lib/mobile/finance";

// Signed-in page (reads the session and organization finances on every request).
export const instant = false;

const STATUS: Record<string, ["green" | "amber" | "red" | "gray" | "purple", string]> = {
  PENDING: ["amber", "Pending"], APPROVED: ["green", "Approved"], REJECTED: ["red", "Rejected"], CANCELLED: ["gray", "Cancelled"], REVERSED: ["gray", "Reversed"],
};
const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "REVERSED"] as const;

type SP = { org?: string; type?: string; status?: string; category?: string; from?: string; to?: string };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireOrgPermissionAnywhere("fees.view_org");
  const sp = await searchParams;
  const viewIds = orgIdsWith(user, "fees.view_org");
  const names = new Map(user.memberships.map((m) => [m.organizationId, m.organizationName]));
  const orgId = viewIds.includes(sp.org ?? "") ? sp.org! : viewIds[0];
  const canRecord = canOrg(user, "expenses.record", orgId);
  const canApprove = canOrg(user, "expenses.approve", orgId);

  const filter: FundFilter = {
    type: sp.type === "EXPENSE" || sp.type === "INCOME" ? sp.type : undefined,
    status: (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as FundFilter["status"]) : undefined,
    category: (Object.keys(CATEGORY_LABEL) as string[]).includes(sp.category ?? "") ? (sp.category as FundCategory) : undefined,
    from: isYmd(sp.from ?? "") ? sp.from : undefined, to: isYmd(sp.to ?? "") ? sp.to : undefined,
  };
  const [sum, fin, rows, pending] = await Promise.all([fundSummary(orgId), orgFinance(orgId), listFunds(orgId, filter), listFunds(orgId, { status: "PENDING" })]);
  const toDecide = canApprove ? pending.filter((r) => r.recordedById !== user.id) : [];

  return (
    <Page>
      <PageHeader
        title="Expenses & funds"
        subtitle="Money the organization spent and money received besides member fees. Records count only after the President approves them."
        actions={canRecord ? (
          <>
            <ModalButton label="+ Record expense" variant="primary" title="Record an expense" description={names.get(orgId)} size="lg"><RecordFundForm organizationId={orgId} type="EXPENSE" /></ModalButton>
            <ModalButton label="+ Record other funds" title="Record other money received" description="Opening balance, donations, sponsorships. Member fee payments are recorded under Fees & collections." size="lg"><RecordFundForm organizationId={orgId} type="INCOME" /></ModalButton>
          </>
        ) : undefined}
      />
      <FinanceNav current="/fees/expenses" orgId={orgId} />
      <OrgPicker orgId={orgId} options={viewIds.map((id) => ({ id, name: names.get(id) ?? id }))} />

      <section aria-label="Balance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Available balance" value={formatPeso(sum.available)} hint="Money held now" tone={Number(sum.available) < 0 ? "red" : "purple"} icon={<Icon name="wallet" />} />
        <StatCard label="Collected fees" value={formatPeso(sum.collected)} hint={Number(sum.otherIncome) > 0 ? `+ ${formatPeso(sum.otherIncome)} other funds` : "Confirmed only"} tone="green" icon={<Icon name="check" />} />
        <StatCard label="Expenses" value={formatPeso(sum.expenses)} hint={sum.pendingExpenseCount ? `${sum.pendingExpenseCount} pending · ${formatPeso(sum.pendingExpenses)}` : "No pending expenses"} tone="red" icon={<Icon name="chart" />} />
        <StatCard label="Outstanding fees" value={formatPeso(fin.totals.outstanding)} hint="Owed by members" tone="amber" icon={<Icon name="alert" />} />
      </section>

      {toDecide.length > 0 && (
        <section aria-labelledby="to-decide" className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-5">
          <h2 id="to-decide" className="font-semibold">Waiting for your approval ({toDecide.length})</h2>
          <ul className="flex flex-col gap-2">
            {toDecide.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
                <span className="text-sm"><Badge tone={r.type === "EXPENSE" ? "red" : "green"}>{r.type === "EXPENSE" ? "Expense" : "Funds in"}</Badge> <strong>{r.title}</strong> · {formatPeso(r.amount)} · {r.categoryLabel} · {formatDate(new Date(`${r.occurredOn}T00:00:00+08:00`))} · by {r.recordedBy}{r.hasReceipt ? <> · <a href={`/fees/expenses/${r.id}/receipt`} target="_blank" rel="noreferrer" className="text-primary hover:underline">receipt</a></> : <span className="text-warning"> · no receipt</span>}</span>
                <span className="flex gap-2">
                  <ModalButton label="Approve" variant="primary" title="Approve this record?" size="md"><DecideFundForm id={r.id} kind="approve" summary={`${r.title} · ${formatPeso(r.amount)} · purpose: ${r.purpose}`} /></ModalButton>
                  <ModalButton label="Reject" variant="danger" title="Reject this record?" size="md"><DecideFundForm id={r.id} kind="reject" summary={`${r.title} · ${formatPeso(r.amount)}`} /></ModalButton>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="grid gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:grid-cols-3 lg:grid-cols-6" aria-label="Filter records">
        <input type="hidden" name="org" value={orgId} />
        <select name="type" defaultValue={filter.type ?? ""} aria-label="Type" className={inputClass}><option value="">All types</option><option value="EXPENSE">Expenses</option><option value="INCOME">Other funds</option></select>
        <select name="status" defaultValue={filter.status ?? ""} aria-label="Status" className={inputClass}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS[s][1]}</option>)}</select>
        <select name="category" defaultValue={filter.category ?? ""} aria-label="Category" className={inputClass}><option value="">All categories</option>{[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES.filter((c) => c !== "OTHER")].map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select>
        <input type="date" name="from" defaultValue={filter.from} aria-label="From" className={inputClass} />
        <input type="date" name="to" defaultValue={filter.to} aria-label="To" className={inputClass} />
        <button type="submit" className={secondaryButton}>Apply filters</button>
      </form>

      {rows.length === 0 ? <EmptyState title="No records match" hint={canRecord ? "Record an expense or other funds with the buttons above." : "Nothing has been recorded yet."} /> : (
        <Table head={["Date", "Description", "Category", "Amount", "Status", "Recorded / decided", "Actions"]}>
          {rows.map((r) => {
            const [tone, label] = STATUS[r.status];
            const mine = r.recordedById === user.id;
            return (
              <tr key={r.id} className="border-t border-border align-top">
                <Td className="whitespace-nowrap">{formatDate(new Date(`${r.occurredOn}T00:00:00+08:00`))}</Td>
                <Td><p className="font-medium">{r.title}</p><p className="text-xs text-muted">{r.purpose}</p>{r.notes ? <p className="text-xs text-muted">Note: {r.notes}</p> : null}</Td>
                <Td><Badge tone={r.type === "EXPENSE" ? "red" : "green"}>{r.type === "EXPENSE" ? "Expense" : "Funds in"}</Badge><p className="mt-1 text-xs text-muted">{r.categoryLabel}</p></Td>
                <Td className={`whitespace-nowrap font-semibold tabular-nums ${r.type === "EXPENSE" ? "text-danger" : "text-success"}`}>{r.type === "EXPENSE" ? "−" : "+"}{formatPeso(r.amount)}</Td>
                <Td><Badge tone={tone}>{label}</Badge>{r.decisionReason ? <p className="mt-1 max-w-[16rem] text-xs text-muted">“{r.decisionReason}”</p> : null}{r.reversalReason ? <p className="mt-1 max-w-[16rem] text-xs text-muted">Reversed: “{r.reversalReason}”</p> : null}</Td>
                <Td className="text-xs text-muted"><p>By {r.recordedBy}</p>{r.decidedBy ? <p>{r.status === "CANCELLED" ? "Cancelled" : "Decided"} by {r.decidedBy}</p> : null}</Td>
                <Td>
                  <div className="flex flex-col items-start gap-1.5 text-sm">
                    {r.hasReceipt ? <a href={`/fees/expenses/${r.id}/receipt`} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">View receipt</a> : <span className="text-xs text-muted">No receipt</span>}
                    {canRecord && mine && r.status === "PENDING" ? (
                      <>
                        <ModalButton label="Edit" variant="link" title="Edit pending record" size="lg"><EditFundForm row={{ id: r.id, type: r.type, title: r.title, amount: r.amount, category: r.category, occurredOn: r.occurredOn, purpose: r.purpose, notes: r.notes }} /></ModalButton>
                        <ModalButton label="Cancel" variant="link" title="Cancel this record?" size="md"><DecideFundForm id={r.id} kind="cancel" summary={`${r.title} · ${formatPeso(r.amount)}`} /></ModalButton>
                      </>
                    ) : null}
                    {canApprove && !mine && r.status === "PENDING" ? <span className="text-xs text-warning">Awaiting your decision (above)</span> : null}
                    {canApprove && r.status === "APPROVED" ? <ModalButton label="Reverse" variant="link" title="Reverse this approved record?" size="md"><DecideFundForm id={r.id} kind="reverse" summary={`${r.title} · ${formatPeso(r.amount)} · approved`} /></ModalButton> : null}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      {!canRecord && !canApprove ? <p className="text-sm text-muted">You have read-only access to these records.</p> : null}
    </Page>
  );
}
