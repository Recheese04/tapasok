import { EmptyState } from "@/components/shared/empty-state";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/shared/pagination";
import { Badge, Card, inputClass, Page, PageHeader, secondaryButton, Table, Td } from "@/components/shared/ui";
import { ModalButton } from "@/components/shared/modal";
import { db } from "@/lib/database/client";
import { canOrg, orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDate, formatPeso } from "@/lib/format";
import { deleteRuleAction, toggleRuleAction, updateConsequenceStatusAction } from "@/features/consequences/actions";
import { ConsequenceForm, RuleForm } from "@/features/consequences/forms";
import { ConfirmButton, RefreshOnSubmit } from "@/components/shared/confirm-button";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const TONE = { PENDING: "amber", COMPLETED: "green", WAIVED: "gray", CANCELLED: "gray" } as const;
const penalty = (c: { kind: string; amount: { toString(): string } | null; hours: { toString(): string } | null }) =>
  c.kind === "SERVICE_HOURS" ? `${c.hours?.toString() ?? "?"} service hr` : c.amount ? formatPeso(c.amount.toString()) : "—";
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default async function ConsequencesPage({ searchParams }: { searchParams: Promise<{ org?: string; status?: string; page?: string }> }) {
  const user = await requireOrgPermissionAnywhere("consequences.view_org");
  const sp = await searchParams;
  const page = parsePage(sp.page);

  const viewIds = orgIdsWith(user, "consequences.view_org");
  const orgNames = new Map(user.memberships.map((m) => [m.organizationId, m.organizationName]));
  // Without a choice, open an organization where the person can manage rules (not one where they only view).
  const orgId = viewIds.includes(sp.org ?? "") ? sp.org! : (viewIds.find((id) => canOrg(user, "consequences.rules", id)) ?? viewIds[0]);
  const status = (["PENDING", "COMPLETED", "WAIVED", "CANCELLED"] as const).find((s) => s === sp.status);
  const manage = orgId ? canOrg(user, "consequences.manage", orgId) : false;
  const manageRules = orgId ? canOrg(user, "consequences.rules", orgId) : false;
  const waive = orgId ? canOrg(user, "consequences.waive", orgId) : false;

  const org = orgId ? await (async () => {
    const where = { organizationId: orgId, ...(status ? { status } : {}) };
    const [total, rows, rules, members, events] = await Promise.all([
      db.consequence.count({ where }),
      db.consequence.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
        select: { id: true, reason: true, status: true, createdAt: true, kind: true, amount: true, hours: true, calculatedAt: true, user: { select: { firstName: true, lastName: true } }, rule: { select: { name: true } }, event: { select: { title: true } } },
      }),
      db.consequenceRule.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" }, include: { _count: { select: { consequences: true } } } }),
      manage ? db.organizationMember.findMany({ where: { organizationId: orgId, endedAt: null }, select: { user: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { user: { lastName: "asc" } } }) : [],
      manage ? db.event.findMany({ where: { organizationId: orgId }, orderBy: { startsAt: "desc" }, take: 50, select: { id: true, title: true } }) : [],
    ]);
    return { total, rows, rules, members, events };
  })() : null;

  return (
    <Page>
      <PageHeader title="Manage Consequences" subtitle="Official, policy-based records for your organization. An absence or an unfinished obligation is not a consequence until it is reviewed and recorded here, or until a rule your organization attached to the event applies." actions={(manage || manageRules) && org && orgId && (
        <>
          {manage && <ModalButton label="+ Record consequence" variant="primary" title="Record a consequence" description="An official, policy-based record. Give the reason and any supporting detail." size="md">
            <ConsequenceForm
              organizationId={orgId}
              members={org.members.map((m) => ({ id: m.user.id, label: `${m.user.lastName}, ${m.user.firstName}` }))}
              rules={org.rules.filter((r) => r.active).map((r) => ({ id: r.id, label: r.name }))}
              events={org.events.map((e) => ({ id: e.id, label: e.title }))}
            />
          </ModalButton>}
          {manageRules && <ModalButton label="+ Add rule" title="Add a consequence rule" description="Rules apply only to events they are attached to." size="md"><RuleForm organizationId={orgId} /></ModalButton>}
        </>
      )} />

      {org && orgId && (
        <section aria-labelledby="org-cons" className="flex flex-col gap-4">
          <h2 id="org-cons" className="font-medium">Organization records — {orgNames.get(orgId)}</h2>
          <form className="flex flex-wrap gap-2">
            {viewIds.length > 1 && (
              <select name="org" defaultValue={orgId} aria-label="Organization" className={`${inputClass} max-w-xs`}>
                {viewIds.map((id) => <option key={id} value={id}>{orgNames.get(id)}</option>)}
              </select>
            )}
            <select name="status" defaultValue={status ?? ""} aria-label="Status" className={`${inputClass} max-w-xs`}>
              <option value="">All statuses</option><option value="PENDING">Pending</option><option value="COMPLETED">Completed</option><option value="WAIVED">Waived</option>
            </select>
            <button type="submit" className={secondaryButton}>Filter</button>
          </form>

          {org.rows.length === 0 ? <EmptyState title="No consequence records" /> : (
            <Table head={["Member", "Reason", "Penalty", "Status", "Date", "Actions"]}>
              {org.rows.map((c) => (
                <tr key={c.id}>
                  <Td>{c.user.lastName}, {c.user.firstName}</Td><Td>{c.reason}</Td>
                  <Td>{penalty(c)}<div className="text-xs text-muted">{c.calculatedAt ? "Automatic" : "Manual"}{c.event ? ` · ${c.event.title}` : ""}</div></Td>
                  <Td><Badge tone={TONE[c.status]}>{label(c.status)}</Badge></Td><Td>{formatDate(c.createdAt)}</Td>
                  <Td>
                    {c.status === "PENDING" && (manage || waive) && (
                      <div className="flex flex-col gap-1">
                        {manage && c.kind === "SERVICE_HOURS" && (
                          <form action={updateConsequenceStatusAction}>
                            <input type="hidden" name="consequenceId" value={c.id} /><input type="hidden" name="status" value="COMPLETED" /><input type="hidden" name="note" value="" />
                            <ConfirmButton message="Mark this consequence as completed?" className="text-primary hover:underline">Mark completed</ConfirmButton>
                          </form>
                        )}
                        {waive && (
                          <form action={updateConsequenceStatusAction}>
                            <input type="hidden" name="consequenceId" value={c.id} /><input type="hidden" name="status" value="WAIVED" />
                            <input name="note" aria-label="Waiver note" placeholder="Reason for waiver" maxLength={500} className={`${inputClass} mb-1`} />
                            <ConfirmButton message="Waive this consequence?" className="text-danger hover:underline">Waive</ConfirmButton>
                          </form>
                        )}
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <Pagination page={page} total={org.total} basePath="/consequences/manage" params={{ org: orgId, status }} />

          <Card title="Rules">
            {org.rules.length === 0 ? <p className="text-sm text-muted">No rules defined.</p> : (
              <ul className="flex flex-col gap-2 text-sm">
                {org.rules.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <span>{r.name} <span className="text-muted">— {r.trigger === "ABSENT" ? "absent" : "late"}{r.sessionKind ? `, ${r.sessionKind === "TIME_IN" ? "time-in" : "time-out"} only` : ""}{r.wholeDay ? ", whole day" : ""}: {r.penaltyType === "FINE" ? formatPeso(r.fineAmount?.toString() ?? "0") : `${r.serviceHours?.toString()} service hr`}</span>{r.description ? <span className="text-muted"> · {r.description}</span> : null} {!r.active && <Badge>Inactive</Badge>}</span>
                    {manageRules && (
                      <span className="flex shrink-0 items-center gap-3">
                        <ModalButton label="Edit" variant="link" title="Edit consequence rule" size="md">
                          <RuleForm organizationId={orgId} rule={{
                            id: r.id, name: r.name, description: r.description ?? "", trigger: r.trigger, sessionKind: r.sessionKind ?? "", wholeDay: r.wholeDay,
                            penaltyType: r.penaltyType, fineAmount: r.fineAmount?.toString() ?? "", serviceHours: r.serviceHours?.toString() ?? "",
                          }} />
                        </ModalButton>
                        <form action={toggleRuleAction}><RefreshOnSubmit /><input type="hidden" name="ruleId" value={r.id} /><button type="submit" className="text-primary hover:underline">{r.active ? "Deactivate" : "Activate"}</button></form>
                        {r._count.consequences === 0 && (
                          <form action={deleteRuleAction}>
                            <input type="hidden" name="ruleId" value={r.id} />
                            <ConfirmButton message={`Delete the rule "${r.name}"? It is also removed from any event it is attached to.`} className="text-danger hover:underline">Delete</ConfirmButton>
                          </form>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

        </section>
      )}
    </Page>
  );
}
