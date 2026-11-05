import { FilterBar } from "@/components/shared/filter-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/shared/pagination";
import { Badge, ButtonLink, Card, inputClass, Page, PageHeader, secondaryButton, Table, Td } from "@/components/shared/ui";
import { ModalButton } from "@/components/shared/modal";
import { ConfirmButton, RefreshOnSubmit } from "@/components/shared/confirm-button";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { canOrg, orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDate, formatDateTime, formatPeso } from "@/lib/format";
import { deleteFeeTypeAction, setFeeTypeActiveAction, verifyPaymentAction, voidPaymentAction } from "@/features/fees/actions";
import { ledger } from "@/features/fees/ledger";
import { FEE_KIND } from "@/features/fees/labels";
import { AdjustForm, ApplyToAllButton, AssessMemberForm, FeeTypeEdit, FeeTypeForm, PaymentForm } from "@/features/fees/forms";
import { applyPreview } from "@/features/fees/service";
import { FinanceNav } from "@/features/finance/finance-nav";
import { fundSummary } from "@/features/finance/funds";
import { filterLabel, filterParams, parseFinanceFilter, termOptions, termSelects, termWhere, yearLevelWhere } from "@/features/fees/filters";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const D = (n: Prisma.Decimal) => formatPeso(n.toString());
const TONE = { PAID: "green", PARTIAL: "amber", UNPAID: "red", CREDIT: "gray" } as const;
const KIND = FEE_KIND;

const feeInclude = {
  adjustments: { select: { amount: true, type: true, reason: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
  payments: { orderBy: { createdAt: "desc" as const }, select: { id: true, amount: true, status: true, voidedAt: true, paidAt: true, method: true, reference: true, receiptCode: true, rejectionReason: true, proofKey: true } },
};

type Sp = { org?: string; page?: string; sy?: string; sem?: string; yl?: string; q?: string; status?: string; fee?: string };
const LEDGER_STATUSES = [["UNPAID", "Unpaid"], ["PARTIAL", "Partly paid"], ["PAID", "Paid"], ["CREDIT", "Overpaid"]] as const;

export default async function ManageFeesPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requireOrgPermissionAnywhere("fees.view_org");
  const sp = await searchParams;
  const page = parsePage(sp.page);
  // School year / semester / year level: narrows the fees, the member ledger and the collection totals.
  const filter = parseFinanceFilter(sp);
  const terms = await termOptions();
  const filtered = filter.sy !== null || filter.sem !== null || filter.yl !== null;
  // Ledger-only filters (combine with the ones above): name / student number, payment status, fee.
  const q = (sp.q ?? "").trim().slice(0, 100);
  const status = LEDGER_STATUSES.find(([k]) => k === sp.status)?.[0];
  const feeFilter = /^[0-9a-f-]{36}$/.test(sp.fee ?? "") ? sp.fee! : undefined;
  const ledgerFiltered = !!(q || status || feeFilter);

  const viewIds = orgIdsWith(user, "fees.view_org");
  const orgNames = new Map(user.memberships.map((m) => [m.organizationId, m.organizationName]));
  const orgId = viewIds.includes(sp.org ?? "") ? sp.org! : viewIds[0];
  const manage = orgId ? canOrg(user, "fees.manage", orgId) : false;

  const org = orgId ? await (async () => {
    const base = { organizationId: orgId };
    const where = { ...base, ...termWhere(filter), user: yearLevelWhere(filter) };
    const feeTypeWhere = { ...base, ...(filter.sem ? { semesterId: filter.sem } : filter.sy ? { semester: { schoolYearId: filter.sy } } : {}) };
    // The ledger list: database filters for term, year level, fee and name; the payment status is derived from the ledger
    // (amount + adjustments - confirmed payments), so it is applied to the whole filtered set on the server, before paging.
    const ledgerWhere: Prisma.StudentFeeWhereInput = {
      ...where,
      ...(feeFilter ? { feeTypeId: feeFilter } : {}),
      user: {
        ...yearLevelWhere(filter),
        ...(q ? { OR: [
          { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } },
          { studentProfile: { studentNumber: { contains: q, mode: "insensitive" } } },
        ] } : {}),
      },
    };
    const [feeTypes, events, ledgerRows, pendingPayments] = await Promise.all([
      db.feeType.findMany({ where: feeTypeWhere, orderBy: { createdAt: "desc" }, include: { _count: { select: { assignments: true } } } }),
      manage ? db.event.findMany({ where: { ...base, deletedAt: null }, orderBy: { startsAt: "desc" }, take: 50, select: { id: true, title: true } }) : [],
      db.studentFee.findMany({
        where: ledgerWhere, orderBy: [{ title: "asc" }, { user: { lastName: "asc" } }],
        include: {
          // Treasurer needs only a name, student number, program and year level to do the job, not contact details.
          user: { select: { firstName: true, lastName: true, studentProfile: { select: { studentNumber: true, yearLevel: true, course: true, program: { select: { code: true } } } } } },
          semester: { select: { name: true, schoolYear: { select: { label: true } } } },
          ...feeInclude,
        },
      }),
      manage ? db.payment.findMany({
        where: { status: "PENDING", voidedAt: null, studentFee: where }, orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, method: true, reference: true, receiptCode: true, createdAt: true, proofKey: true, studentFee: { select: { title: true, user: { select: { firstName: true, lastName: true } } } } },
      }) : [],
    ]);
    const all = await db.studentFee.findMany({ where, include: { adjustments: { select: { amount: true } }, payments: { select: { amount: true, status: true, voidedAt: true } } } });
    const totals = all.map(ledger).reduce((t, l) => ({ due: t.due.add(l.effectiveDue), paid: t.paid.add(l.paid) }), { due: new Prisma.Decimal(0), paid: new Prisma.Decimal(0) });
    const funds = await fundSummary(orgId);
    const matching = status ? ledgerRows.filter((f) => ledger(f).status === status) : ledgerRows;
    const rows = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    // Preview of "Apply to all members" for each active fee (eligible / already charged / to add).
    const previews = manage ? new Map((await Promise.all(feeTypes.filter((t) => t.active).map((t) => applyPreview(t.id)))).filter((x) => x !== null).map((x) => [x.feeTypeId, x])) : new Map();
    return { feeTypes, events, total: matching.length, rows, pendingPayments, totals, funds, previews };
  })() : null;

  return (
    <Page>
      <PageHeader title="Fees & Payments" subtitle="The organization's fees, collections and ledger. Your own fees are under My Fees & Payments." actions={<>{manage && org && orgId && (<ModalButton label="+ Create fee" variant="primary" title="Create fee" description="Name the fee, then apply it to members from the Fees list." size="md"><FeeTypeForm organizationId={orgId} events={org.events} /></ModalButton>)}<ButtonLink href="/reports" variant="secondary">View reports</ButtonLink></>} />

      {orgId ? <FinanceNav current="/fees/manage" orgId={orgId} /> : null}
      {org && orgId && (
        <section aria-labelledby="org-fees" className="flex flex-col gap-4">
          <h2 id="org-fees" className="font-medium">{orgNames.get(orgId)} — ledger</h2>
          {viewIds.length > 1 && (
            <form className="flex gap-2">
              <select name="org" defaultValue={orgId} aria-label="Organization" className={`${inputClass} max-w-xs`}>{viewIds.map((id) => <option key={id} value={id}>{orgNames.get(id)}</option>)}</select>
              <button type="submit" className={secondaryButton}>Switch</button>
            </form>
          )}
          <FilterBar label="Filter fees and the ledger"
            search={{ placeholder: "Member name or student number" }}
            selects={[
              ...termSelects(terms, filter, { yearLevel: true }),
              { key: "status", label: "Payment status", all: "All statuses", options: LEDGER_STATUSES.map(([k, l]) => [k, l]) },
              { key: "fee", label: "Fee", all: "All fees and fines", options: org.feeTypes.map((t) => [t.id, t.name]) },
            ]} />
          {filtered && <p className="text-sm text-muted" role="status">Showing <strong className="text-foreground">{filterLabel(filter, terms)}</strong>. Expenses and the available balance always cover all time.</p>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card title={filtered ? "Collected (this view)" : "Collected (verified)"}><p className="text-2xl font-semibold">{D(org.totals.paid)}</p><p className="text-xs text-muted">of {D(org.totals.due)} charged</p></Card>
            <Card title={filtered ? "Outstanding (this view)" : "Outstanding member fees"}><p className="text-2xl font-semibold">{D(org.totals.due.sub(org.totals.paid))}</p><p className="text-xs text-muted">Owed, not yet collected</p></Card>
            <Card title="Approved expenses"><p className="text-2xl font-semibold text-danger">{formatPeso(org.funds.expenses)}</p><p className="text-xs text-muted">{org.funds.pendingExpenseCount ? `${org.funds.pendingExpenseCount} pending approval` : "None pending"}</p></Card>
            <Card title="Available balance"><p className="text-2xl font-semibold text-primary">{formatPeso(org.funds.available)}</p><p className="text-xs text-muted">Collected{Number(org.funds.otherIncome) > 0 ? " + other funds" : ""} − expenses</p></Card>
          </div>

          {manage && org.pendingPayments.length > 0 && (
            <Card title={`Digital payments awaiting verification (${org.pendingPayments.length})`}>
              <ul className="flex flex-col gap-3 text-sm">
                {org.pendingPayments.map((p) => (
                  <li key={p.id} className="rounded-lg border border-border p-3">
                    <p>{p.studentFee.user.lastName}, {p.studentFee.user.firstName} · {p.studentFee.title} · <strong>{D(p.amount)}</strong> via {p.method.toLowerCase().replace("_", " ")} · ref {p.reference}</p>
                    <p className="text-xs text-muted">Submitted {formatDateTime(p.createdAt)} · {p.receiptCode} {p.proofKey && <a className="text-primary hover:underline" href={`/fees/proof/${p.id}`} target="_blank" rel="noreferrer">View proof</a>}</p>
                    <form action={verifyPaymentAction} className="mt-2 flex flex-wrap items-center gap-2"><RefreshOnSubmit />
                      <input type="hidden" name="paymentId" value={p.id} />
                      <input name="reason" aria-label="Reason (required to reject)" placeholder="Reason (required to reject)" maxLength={300} className="rounded-lg border border-border bg-surface px-3 py-1 text-sm" />
                      <button type="submit" name="decision" value="approve" className="rounded-xl bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary-hover">Confirm payment</button>
                      <button type="submit" name="decision" value="reject" className="rounded-lg border border-border px-3 py-1 text-sm text-danger hover:bg-sidebar">Reject</button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Fees">
            {org.feeTypes.length === 0 ? <p className="text-sm text-muted">{filtered ? "No fees were created for this school year or semester." : "No fees yet. Create one with + Create fee. Fines from attendance rules appear automatically in the ledger."}</p> : (
              <ul className="flex flex-col gap-3 text-sm">
                {org.feeTypes.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3">
                    <span>{t.name} — {D(t.amount)} <span className="text-muted">({KIND[t.kind]}){!t.active ? " · inactive" : ""}{t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""} · applied to {t._count.assignments} member{t._count.assignments === 1 ? "" : "s"}</span></span>
                    {manage && (
                      <div className="flex flex-wrap items-center gap-3">
                        <FeeTypeEdit feeTypeId={t.id} name={t.name} amount={t.amount.toString()} dueDate={t.dueDate ? t.dueDate.toISOString().slice(0, 10) : ""} description={t.description ?? ""} />
                        <form action={setFeeTypeActiveAction}>
                          <input type="hidden" name="feeTypeId" value={t.id} /><input type="hidden" name="active" value={String(!t.active)} />
                          <ConfirmButton message={t.active ? `Deactivate "${t.name}"? It can no longer be applied to members, but existing charges and payments stay.` : `Reactivate "${t.name}"?`} className="text-xs text-primary hover:underline">{t.active ? "Deactivate" : "Reactivate"}</ConfirmButton>
                        </form>
                        {t._count.assignments === 0 && (
                          <form action={deleteFeeTypeAction}>
                            <input type="hidden" name="feeTypeId" value={t.id} />
                            <ConfirmButton message={`Delete "${t.name}"? It was never applied to anyone.`} className="text-xs text-danger hover:underline">Delete</ConfirmButton>
                          </form>
                        )}
                      </div>
                    )}
                    {manage && t.active && (
                      <div className="flex flex-wrap items-center gap-3">
                        {org.previews.get(t.id) && <ApplyToAllButton preview={org.previews.get(t.id)!} />}
                        <AssessMemberForm feeTypeId={t.id} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="text-sm text-muted" role="status">{org.total} charge{org.total === 1 ? "" : "s"}{filtered || ledgerFiltered ? (org.total === 1 ? " matches these filters" : " match these filters") : ""}.</p>

          {org.rows.length === 0 ? <EmptyState title={filtered || ledgerFiltered ? "No charges match these filters" : "Nothing charged yet"} hint={filtered || ledgerFiltered ? "Try other filters." : undefined} /> : (
            <Table head={["Member", "Fee", "Charged", "Amount", "Adjusted", "Paid", "Balance", "Status", ...(manage ? ["Actions"] : [])]}>
              {org.rows.map((f) => {
                const l = ledger(f);
                return (
                  <tr key={f.id}>
                    <Td>{f.user.lastName}, {f.user.firstName}<div className="text-xs text-muted">{[f.user.studentProfile?.studentNumber, f.user.studentProfile?.program?.code ?? f.user.studentProfile?.course, f.user.studentProfile?.yearLevel ? `Year ${f.user.studentProfile.yearLevel}` : null].filter(Boolean).join(" · ")}</div></Td>
                    <Td>{f.title}<div className="text-xs text-muted">{KIND[f.kind]}{f.semester ? ` · ${f.semester.schoolYear.label} ${f.semester.name}` : ""}</div></Td>
                    <Td>{formatDate(f.createdAt)}{f.payments.find((p) => p.status === "CONFIRMED" && !p.voidedAt) && <div className="text-xs text-muted">Last paid {formatDate(f.payments.find((p) => p.status === "CONFIRMED" && !p.voidedAt)!.paidAt)}</div>}</Td>
                    <Td>{D(f.amountDue)}</Td><Td>{D(l.adjustments)}</Td><Td>{D(l.paid)}</Td><Td>{D(l.balance)}</Td>
                    <Td><Badge tone={TONE[l.status]}>{LEDGER_STATUSES.find(([k]) => k === l.status)?.[1] ?? l.status}</Badge></Td>
                    {manage && (
                      <Td>
                        <div className="flex flex-col gap-2">
                          {l.balance.gt(0) && <ModalButton label="Record payment" variant="link" title="Record payment" description={`${f.user.lastName}, ${f.user.firstName} · ${f.title} · balance ${D(l.balance)}`} size="sm"><PaymentForm studentFeeId={f.id} balance={l.balance.toFixed(2)} /></ModalButton>}
                          <ModalButton label="Adjust ledger" variant="link" title="Adjust ledger" description={`${f.user.lastName}, ${f.user.firstName} · ${f.title}`} size="sm"><AdjustForm studentFeeId={f.id} /></ModalButton>
                          {f.payments.filter((p) => p.status === "CONFIRMED" && !p.voidedAt).map((p) => (
                            <form key={p.id} action={voidPaymentAction} className="flex flex-wrap items-center gap-1 text-xs text-muted">
                              <input type="hidden" name="paymentId" value={p.id} />
                              <span>{p.receiptCode} · {D(p.amount)} · {p.method.toLowerCase().replace("_", " ")}</span>
                              <input name="reason" aria-label="Reason for voiding" placeholder="Void reason" required minLength={3} maxLength={300} className={`${inputClass} w-32`} />
                              <ConfirmButton message="Void this payment? It stays in the history but no longer counts." className="text-danger hover:underline">Void</ConfirmButton>
                            </form>
                          ))}
                        </div>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </Table>
          )}
          <Pagination page={page} total={org.total} basePath="/fees/manage" params={{ org: orgId, ...filterParams(filter), q: q || undefined, status, fee: feeFilter }} />
          
        </section>
      )}
    </Page>
  );
}
