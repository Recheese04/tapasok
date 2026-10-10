import { EmptyState } from "@/components/shared/empty-state";
import { Badge, Page, PageHeader, Table, Td } from "@/components/shared/ui";
import { db } from "@/lib/database/client";
import { requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDate, formatPeso } from "@/lib/format";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const TONE = { PENDING: "amber", COMPLETED: "green", WAIVED: "gray", CANCELLED: "gray" } as const;
const LABEL = { PENDING: "Pending", COMPLETED: "Resolved", WAIVED: "Waived", CANCELLED: "Closed" } as const;
const penalty = (c: { kind: string; amount: { toString(): string } | null; hours: { toString(): string } | null }) =>
  c.kind === "SERVICE_HOURS" ? `${c.hours?.toString() ?? "?"} service hr` : c.amount ? formatPeso(c.amount.toString()) : "—";

/** My Consequences: only the signed-in member's own records. Separate from attendance and obligations. */
export default async function MyConsequencesPage() {
  const user = await requireOrgPermissionAnywhere("org.view");
  const mine = await db.consequence.findMany({
    where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100,
    select: {
      id: true, reason: true, status: true, note: true, createdAt: true, resolvedAt: true, kind: true, amount: true, hours: true,
      organization: { select: { name: true } }, rule: { select: { name: true, description: true } }, event: { select: { title: true } },
    },
  });
  return (
    <Page>
      <PageHeader title="My Consequences" subtitle="Official actions recorded for you under an organization's policy. Missing an event or an obligation is not a consequence unless it was reviewed and recorded." />
      {mine.length === 0 ? <EmptyState title="You have no consequences" /> : (
        <Table head={["Organization", "Reason and policy", "Action", "Status", "Assigned"]}>
          {mine.map((c) => (
            <tr key={c.id}>
              <Td>{c.organization.name}</Td>
              <Td>
                {c.reason}
                {c.event && <div className="text-xs text-muted">Event: {c.event.title}</div>}
                {c.rule && <div className="text-xs text-muted">Policy: {c.rule.name}{c.rule.description ? ` — ${c.rule.description}` : ""}</div>}
                {c.note && <div className="text-xs text-muted">Resolution note: {c.note}</div>}
              </Td>
              <Td>{penalty(c)}</Td>
              <Td><Badge tone={TONE[c.status]}>{LABEL[c.status]}</Badge>{c.resolvedAt && <div className="text-xs text-muted">{formatDate(c.resolvedAt)}</div>}</Td>
              <Td>{formatDate(c.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
