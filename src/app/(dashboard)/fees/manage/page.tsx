import { EmptyState } from "@/components/shared/empty-state";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/shared/pagination";
import { Badge, ButtonLink, Card, inputClass, Page, PageHeader, secondaryButton, Table, Td } from "@/components/shared/ui";
import { ModalButton } from "@/components/shared/modal";
import { ConfirmButton, RefreshOnSubmit } from "@/components/shared/confirm-button";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { canOrg, orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDate, formatDateTime, formatPeso } from "@/lib/format";
import { assignFeeAction, deleteFeeTypeAction, setFeeTypeActiveAction, verifyPaymentAction, voidPaymentAction } from "@/features/fees/actions";
import { ledger } from "@/features/fees/ledger";
import { AdjustForm, AssessMemberForm, FeeTypeEdit, FeeTypeForm, PaymentForm } from "@/features/fees/forms";
import { FinanceNav } from "@/features/finance/finance-nav";
import { fundSummary } from "@/features/finance/funds";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const D = (n: Prisma.Decimal) => formatPeso(n.toString());
const TONE = { PAID: "green", PARTIAL: "amber", UNPAID: "red", CREDIT: "gray" } as const;
const KIND = { DUES: "Dues", SEMESTER_FEE: "Semester fee", EVENT_CONTRIBUTION: "Event contribution", SPECIAL: "Special", FINE: "Fine" } as const;

const feeInclude = {
  adjustments: { select: { amount: true, type: true, reason: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
  payments: { orderBy: { createdAt: "desc" as const }, select: { id: true, amount: true, status: true, voidedAt: true, paidAt: true, method: true, reference: true, receiptCode: true, rejectionReason: true, proofKey: true } },
};

export default async function ManageFeesPage({ searchParams }: { searchParams: Promise<{ org?: string; page?: string }> }) {
  const user = await requireOrgPermissionAnywhere("fees.view_org");
  const sp = await searchParams;
  const page = parsePage(sp.page);

  const viewIds = orgIdsWith(user, "fees.view_org");
  const orgNames = new Map(user.memberships.map((m) => [m.organizationId, m.organizationName]));
  const orgId = viewIds.includes(sp.org ?? "") ? sp.org! : viewIds[0];
  const manage = orgId ? canOrg(user, "fees.manage", orgId) : false;

  const org = orgId ? await (async () => {
    const where = { organizationId: orgId };
    const [feeTypes, events, total, rows, pendingPayments] = await Promise.all([
      db.feeType.findMany({ where, orderBy: { createdAt: "desc" }, include: { _count: { select: { assignments: true } } } }),
      manage ? db.event.findMany({ where: { ...where, deletedAt: null }, orderBy: { startsAt: "desc" }, take: 50, select: { id: true, title: true } }) : [],
      db.studentFee.count({ where }),
      db.studentFee.findMany({
        where, orderBy: [{ title: "asc" }, { user: { lastName: "asc" } }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
        include: {
          // Treasurer needs only a name and student number to do the job, not contact details.
          user: { select: { firstName: true, lastName: true, studentProfile: { select: { studentNumber: true } } } },
          ...feeInclude,
        },
      }),
      manage ? db.payment.findMany({
        where: { status: "PENDING", voidedAt: null, studentFee: { organizationId: orgId } }, orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, method: true, reference: true, receiptCode: true, createdAt: true, proofKey: true, studentFee: { select: { title: true, user: { select: { firstName: true, lastName: true } } } } },
      }) : [],
    ]);
    const all = await db.studentFee.findMany({ where, include: { adjustments: { select: { amount: true } }, payments: { select: { amount: true, status: true, voidedAt: true } } } });
    const totals = all.map(ledger).reduce((t, l) => ({ due: t.due.add(l.effectiveDue), paid: t.paid.add(l.paid) }), { due: new Prisma.Decimal(0), paid: new Prisma.Decimal(0) });
    const funds = await fundSummary(orgId);
    return { feeTypes, events, total, rows, pendingPayments, totals, funds };
  })() : null;

  return (
    <Page>
      <PageHeader title="Fees & Payments" subtitle="The organization's fees, collections and ledger. Your own fees are under My Fees & Payments." actions={<>{manage && org && orgId && (<ModalButton label="+ Create fee" variant="primary" title="Create fee" description="A fee is assessed to members afterwards, from the Assessments list." size="md"><FeeTypeForm organizationId={orgId} events={org.events} /></ModalButton>)}<ButtonLink href="/reports" variant="secondary">View reports</ButtonLink></>} />

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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="Collected (verified)"><p className="text-2xl font-semibold">{D(org.totals.paid)}</p><p className="text-xs text-muted">of {D(org.totals.due)} assessed</p></Card>
            <Card title="Outstanding member fees"><p className="text-2xl font-semibold">{D(org.totals.due.sub(org.totals.paid))}</p><p className="text-xs text-muted">Owed, not yet collected</p></Card>
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

          <Card title="Assessments">
            {org.feeTypes.length === 0 ? <p className="text-sm text-muted">No assessments yet. Fines from attendance rules appear automatically in the ledger.</p> : (
              <ul className="flex flex-col gap-3 text-sm">
                {org.feeTypes.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3">
                    <span>{t.name} — {D(t.amount)} <span className="text-muted">({KIND[t.kind]}){!t.active ? " · inactive" : ""}{t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""} · {t._count.assignments} assessed</span></span>
                    {manage && (
                      <div className="flex flex-wrap items-center gap-3">
                        <FeeTypeEdit feeTypeId={t.id} name={t.name} amount={t.amount.toString()} dueDate={t.dueDate ? t.dueDate.toISOString().slice(0, 10) : ""} description={t.description ?? ""} />
                        <form action={setFeeTypeActiveAction}>
                          <input type="hidden" name="feeTypeId" value={t.id} /><input type="hidden" name="active" value={String(!t.active)} />
                          <ConfirmButton message={t.active ? `Deactivate "${t.name}"? No new assessments, but existing ones and payments stay.` : `Reactivate "${t.name}"?`} className="text-xs text-primary hover:underline">{t.active ? "Deactivate" : "Reactivate"}</ConfirmButton>
                        </form>
                        {t._count.assignments === 0 && (
                          <form action={deleteFeeTypeAction}>
                            <input type="hidden" name="feeTypeId" value={t.id} />
                            <ConfirmButton message={`Delete "${t.name}"? It was never assessed to anyone.`} className="text-xs text-danger hover:underline">Delete</ConfirmButton>
                          </form>
                        )}
                      </div>
                    )}
                    {manage && t.active && (
                      <div className="flex flex-wrap items-center gap-3">
                        <form action={assignFeeAction}>
                          <input type="hidden" name="feeTypeId" value={t.id} />
                          <ConfirmButton message={`Assess "${t.name}" (${D(t.amount)}) to all eligible members who don't have it yet?`} className={secondaryButton}>Assess all members</ConfirmButton>
                        </form>
                        <AssessMemberForm feeTypeId={t.id} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {org.rows.length === 0 ? <EmptyState title="Nothing assessed yet" /> : (
            <Table head={["Member", "Obligation", "Amount", "Adjusted", "Paid", "Balance", "Status", ...(manage ? ["Actions"] : [])]}>
              {org.rows.map((f) => {
                const l = ledger(f);
                return (
                  <tr key={f.id}>
                    <Td>{f.user.lastName}, {f.user.firstName}<div className="text-xs text-muted">{f.user.studentProfile?.studentNumber ?? ""}</div></Td>
                    <Td>{f.title}<div className="text-xs text-muted">{KIND[f.kind]}</div></Td><Td>{D(f.amountDue)}</Td><Td>{D(l.adjustments)}</Td><Td>{D(l.paid)}</Td><Td>{D(l.balance)}</Td>
                    <Td><Badge tone={TONE[l.status]}>{l.status.toLowerCase()}</Badge></Td>
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
          <Pagination page={page} total={org.total} basePath="/fees/manage" params={{ org: orgId }} />
          
        </section>
      )}
    </Page>
  );
}
