import { EmptyState } from "@/components/shared/empty-state";
import { Badge, Page, PageHeader, Table, Td } from "@/components/shared/ui";
import { db } from "@/lib/database/client";
import { requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { SubmitObligationForm } from "@/features/obligations/forms";
import { displayStatus } from "@/features/obligations/service";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const TONE = { PENDING: "amber", IN_PROGRESS: "amber", OVERDUE: "red", COMPLETED: "green", CANCELLED: "gray" } as const;
const LABEL = { PENDING: "Pending", IN_PROGRESS: "In progress", OVERDUE: "Overdue", COMPLETED: "Completed", CANCELLED: "Cancelled" } as const;

/** My Obligations: only the signed-in member's own records, from every organization they belong to. */
export default async function MyObligationsPage() {
  const user = await requireOrgPermissionAnywhere("org.view");
  const rows = await db.obligation.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    select: {
      id: true, title: true, description: true, completionRequirements: true, dueAt: true, status: true, memberNote: true, completionNote: true, completedAt: true, createdAt: true,
      organization: { select: { name: true } }, event: { select: { title: true } },
    },
  });
  return (
    <Page>
      <PageHeader title="My Obligations" subtitle="Requirements assigned to you by your organizations. These are separate from your attendance and consequences." />
      {rows.length === 0 ? <EmptyState title="You have no obligations" hint="Officers assign obligations such as forms to submit or duties to complete." /> : (
        <Table head={["Obligation", "Organization", "Due", "Status", "Details"]}>
          {rows.map((o) => {
            const st = displayStatus(o);
            const open = o.status === "PENDING" || o.status === "IN_PROGRESS";
            return (
              <tr key={o.id}>
                <Td><div className="font-medium">{o.title}</div>{o.event && <div className="text-xs text-muted">Event: {o.event.title}</div>}</Td>
                <Td>{o.organization.name}</Td>
                <Td>{o.dueAt ? formatDateTime(o.dueAt) : "—"}</Td>
                <Td><Badge tone={TONE[st]}>{LABEL[st]}</Badge></Td>
                <Td>
                  <div className="flex max-w-sm flex-col gap-2 text-sm">
                    {o.description && <p className="whitespace-pre-line">{o.description}</p>}
                    {o.completionRequirements && <p className="text-xs text-muted">To complete: {o.completionRequirements}</p>}
                    {o.memberNote && <p className="text-xs text-muted">Your note: {o.memberNote}</p>}
                    {o.status === "COMPLETED" && <p className="text-xs text-muted">Completed {o.completedAt ? formatDateTime(o.completedAt) : ""}{o.completionNote ? ` · ${o.completionNote}` : ""}</p>}
                    {open && <SubmitObligationForm obligationId={o.id} />}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </Page>
  );
}
