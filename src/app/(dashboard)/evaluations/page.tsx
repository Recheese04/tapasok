import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { ModalButton } from "@/components/shared/modal";
import { Badge, Page, PageHeader, Table, Td } from "@/components/shared/ui";
import { db } from "@/lib/database/client";
import { canOrg, orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { listEvaluations } from "@/features/evaluations/queries";
import { CreateEvaluationForm } from "@/features/evaluations/forms";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function EvaluationsPage() {
  const user = await requireOrgPermissionAnywhere("org.view");
  const forms = await listEvaluations(user);

  // Only organizations where this person manages evaluations (President, Secretary, Officer) can start one, and only for their own events.
  const manageIds = orgIdsWith(user, "evaluations.manage");
  const events = manageIds.length
    ? await db.event.findMany({
        where: { organizationId: { in: manageIds }, evaluation: null, status: { not: "CANCELLED" }, deletedAt: null },
        orderBy: { startsAt: "desc" }, take: 100,
        select: { id: true, title: true, startsAt: true, organization: { select: { name: true } } },
      })
    : [];
  const multiOrg = manageIds.length > 1;

  return (
    <Page>
      <PageHeader
        title="Event evaluations"
        subtitle="Give feedback on events you attended. Presidents, secretaries and officers create and manage evaluations for their own organization's events."
        actions={manageIds.length > 0 && (
          <ModalButton label="+ Create evaluation" variant="primary" title="Create evaluation" description="Start an evaluation for one of your organization's events." size="sm">
            <CreateEvaluationForm events={events.map((e) => ({ id: e.id, label: multiOrg ? `${e.title} · ${e.organization.name}` : e.title }))} />
          </ModalButton>
        )}
      />
      {forms.length === 0 ? <EmptyState title="No evaluations yet" hint={manageIds.length ? "Use Create evaluation to start one for an event." : undefined} /> : (
        <Table head={["Evaluation", "Organization", "Status", "For you", "Responses", "Actions"]}>
          {forms.map((f) => {
            const manage = canOrg(user, "evaluations.manage", f.organizationId);
            return (
              <tr key={f.id}>
                <Td><Link className="font-medium text-primary hover:underline" href={`/evaluations/${f.id}`}>{f.title}</Link></Td>
                <Td>{f.organizationName}</Td>
                <Td><Badge tone={f.status === "OPEN" ? "green" : f.status === "CLOSED" ? "gray" : "amber"}>{f.status.charAt(0) + f.status.slice(1).toLowerCase()}</Badge></Td>
                <Td>{f.submitted ? "Submitted" : f.status === "OPEN" ? (f.attended ? "Waiting for your answers" : "You did not attend") : "—"}</Td>
                <Td>{f.responseCount ?? "—"}</Td>
                <Td><Link href={`/evaluations/${f.id}`} className="text-sm font-medium text-primary hover:underline">{manage ? "Manage" : "Open"}</Link></Td>
              </tr>
            );
          })}
        </Table>
      )}
    </Page>
  );
}
