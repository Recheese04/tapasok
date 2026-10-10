import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/shared/pagination";
import { Badge, inputClass, Page, PageHeader, secondaryButton, Table, Td } from "@/components/shared/ui";
import { ModalButton } from "@/components/shared/modal";
import { db } from "@/lib/database/client";
import { canOrg, orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDateTime, toManilaLocal } from "@/lib/format";
import { cancelObligationAction, completeObligationAction } from "@/features/obligations/actions";
import { ObligationEdit, ObligationForm } from "@/features/obligations/forms";
import { displayStatus } from "@/features/obligations/service";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const TONE = { PENDING: "amber", IN_PROGRESS: "amber", OVERDUE: "red", COMPLETED: "green", CANCELLED: "gray" } as const;
const LABEL = { PENDING: "Pending", IN_PROGRESS: "In progress", OVERDUE: "Overdue", COMPLETED: "Completed", CANCELLED: "Cancelled" } as const;

/** Officer view: obligations of organizations where the signed-in user holds obligations.view_org. */
export default async function ManageObligationsPage({ searchParams }: { searchParams: Promise<{ org?: string; status?: string; page?: string }> }) {
  const user = await requireOrgPermissionAnywhere("obligations.view_org");
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const viewIds = orgIdsWith(user, "obligations.view_org");
  const names = new Map(user.memberships.map((m) => [m.organizationId, m.organizationName]));
  const orgId = viewIds.includes(sp.org ?? "") ? sp.org! : viewIds[0];
  const status = (["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const).find((s) => s === sp.status);
  const manage = canOrg(user, "obligations.manage", orgId);

  const where = { organizationId: orgId, ...(status ? { status } : {}) };
  const [total, rows, members, events] = await Promise.all([
    db.obligation.count({ where }),
    db.obligation.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, title: true, description: true, completionRequirements: true, dueAt: true, status: true, memberNote: true, submittedAt: true, user: { select: { firstName: true, lastName: true } } },
    }),
    manage ? db.organizationMember.findMany({ where: { organizationId: orgId, endedAt: null, user: { status: "ACTIVE" } }, select: { user: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { user: { lastName: "asc" } } }) : [],
    manage ? db.event.findMany({ where: { organizationId: orgId }, orderBy: { startsAt: "desc" }, take: 50, select: { id: true, title: true } }) : [],
  ]);

  return (
    <Page>
      <PageHeader title="Manage Obligations" subtitle={`Requirements assigned to members of ${names.get(orgId) ?? "your organization"}.`} actions={manage && (
        <ModalButton label="+ Create obligation" variant="primary" title="Create obligation" description="Assign a requirement to one or more members of this organization." size="lg">
          <ObligationForm organizationId={orgId} members={members.map((m) => ({ id: m.user.id, label: `${m.user.lastName}, ${m.user.firstName}` }))} events={events.map((e) => ({ id: e.id, label: e.title }))} />
        </ModalButton>
      )} />
      <form className="flex flex-wrap gap-2">
        {viewIds.length > 1 && <select name="org" defaultValue={orgId} aria-label="Organization" className={`${inputClass} max-w-xs`}>{viewIds.map((id) => <option key={id} value={id}>{names.get(id)}</option>)}</select>}
        <select name="status" defaultValue={status ?? ""} aria-label="Status" className={`${inputClass} max-w-xs`}>
          <option value="">All statuses</option><option value="PENDING">Pending</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
        </select>
        <button type="submit" className={secondaryButton}>Filter</button>
      </form>

      {rows.length === 0 ? <EmptyState title="No obligations" /> : (
        <Table head={["Member", "Obligation", "Due", "Status", "Actions"]}>
          {rows.map((o) => {
            const st = displayStatus(o);
            return (
              <tr key={o.id}>
                <Td>{o.user.lastName}, {o.user.firstName}</Td>
                <Td>{o.title}{o.memberNote && <div className="text-xs text-muted">Member note: {o.memberNote}</div>}</Td>
                <Td>{o.dueAt ? formatDateTime(o.dueAt) : "—"}</Td>
                <Td><Badge tone={TONE[st]}>{LABEL[st]}</Badge></Td>
                <Td>
                  {manage && (o.status === "PENDING" || o.status === "IN_PROGRESS") && (
                    <div className="flex flex-col gap-1 text-sm">
                      <ObligationEdit id={o.id} title={o.title} description={o.description ?? ""} completionRequirements={o.completionRequirements ?? ""} dueAt={o.dueAt ? toManilaLocal(o.dueAt) : ""} />
                      <form action={completeObligationAction}>
                        <input type="hidden" name="obligationId" value={o.id} /><input type="hidden" name="note" value="" />
                        <ConfirmButton message="Verify that this member completed the obligation?" className="text-primary hover:underline">Mark completed</ConfirmButton>
                      </form>
                      <form action={cancelObligationAction}>
                        <input type="hidden" name="obligationId" value={o.id} /><input type="hidden" name="note" value="" />
                        <ConfirmButton message="Cancel this obligation? It stays in the history." className="text-danger hover:underline">Cancel</ConfirmButton>
                      </form>
                    </div>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      <Pagination page={page} total={total} basePath="/obligations/manage" params={{ org: orgId, status }} />

    </Page>
  );
}
