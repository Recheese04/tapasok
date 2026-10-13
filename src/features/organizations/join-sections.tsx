import { EmptyState } from "@/components/shared/empty-state";
import { RefreshOnSubmit } from "@/components/shared/confirm-button";
import { Badge, Table, Td } from "@/components/shared/ui";
import { formatDateTime } from "@/lib/format";
import { JoinForm } from "./join-form";
import { JoinButton } from "./join-requests-ui";
import { cancelJoinRequestAction } from "./request-actions";
import { joinableOrganizations, myRequests } from "./requests";

const STATUS = { PENDING: ["amber", "Pending"], APPROVED: ["green", "Accepted"], REJECTED: ["red", "Rejected"], CANCELLED: ["gray", "Cancelled"] } as const;

/** Join-by-code, joining interest-based organizations directly, and any earlier requests. Grants ordinary membership only. */
export async function JoinSections({ userId }: { userId: string }) {
  const [orgs, requests] = await Promise.all([joinableOrganizations(userId), myRequests(userId)]);
  const pendingIn = new Set(requests.filter((r) => r.status === "PENDING").map((r) => r.organizationId));
  return (
    <>
      <section aria-labelledby="browse" className="flex flex-col gap-3">
        <div>
          <h2 id="browse" className="font-medium">Join an organization</h2>
          <p className="text-sm text-muted">Interest-based organizations are open to every student. You become a member right away.</p>
        </div>
        {orgs.length === 0 ? <EmptyState title="No organizations to join right now" hint="You are already a member of every open organization, or none are open yet." /> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {orgs.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-card">
                <div>
                  <p className="font-medium">{o.name}{o.acronym ? ` (${o.acronym})` : ""}</p>
                  <p className="text-xs text-muted">{o._count.members} member{o._count.members === 1 ? "" : "s"}{pendingIn.has(o.id) ? " · you asked to join earlier; no approval is needed any more" : ""}</p>
                </div>
                {o.description && <p className="text-sm text-muted">{o.description}</p>}
                <div className="mt-auto"><JoinButton organizationId={o.id} name={o.name} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="code" className="flex flex-col gap-3">
        <h2 id="code" className="font-medium">I have a join code</h2>
        <JoinForm />
      </section>

      {requests.length > 0 && (
        <section aria-labelledby="mine" className="flex flex-col gap-3">
          <div>
            <h2 id="mine" className="font-medium">Earlier join requests</h2>
            <p className="text-sm text-muted">From before joining became immediate. Kept for your records.</p>
          </div>
          <Table head={["Organization", "Status", "Sent", "Outcome", ""]}>
            {requests.map((r) => {
              const [tone, label] = STATUS[r.status];
              return (
                <tr key={r.id}>
                  <Td>{r.organization.name}</Td>
                  <Td><Badge tone={tone}>{label}</Badge></Td>
                  <Td>{formatDateTime(r.createdAt)}</Td>
                  <Td>{r.decidedAt && r.status !== "CANCELLED" ? `${formatDateTime(r.decidedAt)}${r.decisionNote ? ` · ${r.decisionNote}` : ""}` : "—"}</Td>
                  <Td>
                    {r.status === "PENDING" && (
                      <form action={cancelJoinRequestAction}><RefreshOnSubmit />
                        <input type="hidden" name="requestId" value={r.id} />
                        <button type="submit" className="text-danger hover:underline">Withdraw</button>
                      </form>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        </section>
      )}
    </>
  );
}
