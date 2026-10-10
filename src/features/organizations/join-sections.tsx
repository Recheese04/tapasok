import { EmptyState } from "@/components/shared/empty-state";
import { RefreshOnSubmit } from "@/components/shared/confirm-button";
import { Badge, Table, Td } from "@/components/shared/ui";
import { formatDateTime } from "@/lib/format";
import { JoinForm } from "./join-form";
import { RequestToJoinForm } from "./join-requests-ui";
import { cancelJoinRequestAction } from "./request-actions";
import { joinableOrganizations, myRequests } from "./requests";

const TONE = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "gray" } as const;

/** Join-by-code, request-to-join and the person's own requests. Shown on My Organizations; grants ordinary membership only. */
export async function JoinSections({ userId }: { userId: string }) {
  const [orgs, requests] = await Promise.all([joinableOrganizations(userId), myRequests(userId)]);
  return (
    <>
      <section aria-labelledby="code" className="flex flex-col gap-3">
        <h2 id="code" className="font-medium">I have a join code</h2>
        <JoinForm />
      </section>

      <section aria-labelledby="browse" className="flex flex-col gap-3">
        <h2 id="browse" className="font-medium">Request to join</h2>
        {orgs.length === 0 ? <EmptyState title="No organizations are open for requests right now" /> : (
          <ul className="flex flex-col gap-3">
            {orgs.map((o) => (
              <li key={o.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                <p className="font-medium">{o.name}{o.acronym ? ` (${o.acronym})` : ""}</p>
                {o.description && <p className="text-sm text-muted">{o.description}</p>}
                <div className="mt-2"><RequestToJoinForm organizationId={o.id} name={o.name} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="mine" className="flex flex-col gap-3">
        <h2 id="mine" className="font-medium">My requests</h2>
        {requests.length === 0 ? <EmptyState title="You have not sent any requests" /> : (
          <Table head={["Organization", "Status", "Sent", "Decision", ""]}>
            {requests.map((r) => (
              <tr key={r.id}>
                <Td>{r.organization.name}</Td>
                <Td><Badge tone={TONE[r.status]}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge></Td>
                <Td>{formatDateTime(r.createdAt)}</Td>
                <Td>{r.decidedAt && r.status !== "CANCELLED" ? `${formatDateTime(r.decidedAt)}${r.decisionNote ? ` · ${r.decisionNote}` : ""}` : "—"}</Td>
                <Td>
                  {r.status === "PENDING" && (
                    <form action={cancelJoinRequestAction}><RefreshOnSubmit />
                      <input type="hidden" name="requestId" value={r.id} />
                      <button type="submit" className="text-danger hover:underline">Cancel</button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </>
  );
}
