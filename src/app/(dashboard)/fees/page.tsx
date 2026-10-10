import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge, Card, Page, PageHeader, Table, Td } from "@/components/shared/ui";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDate, formatPeso } from "@/lib/format";
import { ledger } from "@/features/fees/ledger";
import { PayOnlineForm } from "@/features/fees/forms";

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

export default async function MyFeesPage() {
  const user = await requireOrgPermissionAnywhere("org.view");

  const mine = await db.studentFee.findMany({
    where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100,
    include: { organization: { select: { name: true } }, feeType: { select: { dueDate: true } }, ...feeInclude },
  });
  const myServiceHours = await db.consequence.findMany({ where: { userId: user.id, kind: "SERVICE_HOURS", status: "PENDING" }, select: { hours: true } });
  const hoursOwed = myServiceHours.reduce((s, c) => s.add(c.hours ?? 0), new Prisma.Decimal(0));

  return (
    <Page>
      <PageHeader title="My Fees & Payments" subtitle="Your own fees, balances and payments. Organization-wide finance is under Organization Management." />

      <Card title="My obligations">
        {!hoursOwed.isZero() && <p className="mb-3 text-sm">Community service owed: <strong>{hoursOwed.toString()} hour{hoursOwed.eq(1) ? "" : "s"}</strong> <Link href="/consequences" className="text-primary hover:underline">(details)</Link></p>}
        {mine.length === 0 ? <EmptyState title="You have no fees" /> : (
          <div className="flex flex-col gap-4">
            <Table head={["Obligation", "Organization", "Due", "Amount", "Adjusted", "Paid", "Balance", "Status"]}>
              {mine.map((f) => {
                const l = ledger(f);
                return (
                  <tr key={f.id}>
                    <Td>{f.title}<div className="text-xs text-muted">{KIND[f.kind]}</div></Td><Td>{f.organization.name}</Td>
                    <Td>{f.feeType?.dueDate ? formatDate(f.feeType.dueDate) : "—"}</Td>
                    <Td>{D(f.amountDue)}</Td><Td>{D(l.adjustments)}</Td><Td>{D(l.paid)}{!l.pending.isZero() && <div className="text-xs text-warning">{D(l.pending)} awaiting verification</div>}</Td><Td>{D(l.balance)}</Td>
                    <Td><Badge tone={TONE[l.status]}>{l.status.toLowerCase()}</Badge></Td>
                  </tr>
                );
              })}
            </Table>
            {mine.filter((f) => ledger(f).balance.sub(ledger(f).pending).gt(0)).map((f) => {
              const l = ledger(f);
              return <div key={f.id}><p className="mb-1 text-sm font-medium">Pay &quot;{f.title}&quot; online</p><PayOnlineForm studentFeeId={f.id} balance={l.balance.sub(l.pending).toFixed(2)} /></div>;
            })}
            {mine.flatMap((f) => f.payments.filter((p) => !p.voidedAt).map((p) => ({ ...p, title: f.title }))).slice(0, 12).length > 0 && (
              <Table head={["Receipt / reference", "For", "Amount", "Method", "Status", "Date"]}>
                {mine.flatMap((f) => f.payments.filter((p) => !p.voidedAt).map((p) => ({ ...p, title: f.title }))).slice(0, 12).map((p) => (
                  <tr key={p.id}>
                    <Td className="font-mono text-xs">{p.receiptCode}</Td><Td>{p.title}</Td><Td>{D(p.amount)}</Td><Td>{p.method.toLowerCase().replace("_", " ")}</Td>
                    <Td><Badge tone={p.status === "CONFIRMED" ? "green" : p.status === "PENDING" ? "amber" : "red"}>{p.status === "CONFIRMED" ? "confirmed" : p.status === "PENDING" ? "awaiting verification" : "rejected"}</Badge>{p.rejectionReason && <div className="text-xs text-muted">{p.rejectionReason}</div>}</Td>
                    <Td>{formatDate(p.paidAt)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        )}
      </Card>

    </Page>
  );
}
