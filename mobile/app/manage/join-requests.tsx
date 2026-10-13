import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { ApiError, api } from "../../src/api/client";
import type { PendingJoinRequest } from "../../src/api/types";
import { Avatar, Badge, Body, Button, Card, Empty, ErrorState, ListGroup, ListItem, Loading, ScreenHeader, SectionTitle, Txt } from "../../src/components/ui";
import { Field, useConfirm, useToast } from "../../src/components/kit";
import { fmtDate } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { colors, space } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

/**
 * Students who asked to join the active organization (joinrequests.review: President, Secretary). The server re-checks the
 * position and that each request belongs to this organization on every decision.
 */
export default function JoinRequests() {
  const router = useRouter();
  const { org, reloadOverview } = useOrg();
  const orgId = org?.id ?? "";
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgJoinRequests(orgId), [orgId]);
  const pending = data?.pending ?? [];
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={org?.name} title="Join requests" subtitle={data ? `${pending.length} waiting for a decision` : undefined} back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {pending.length === 0 ? <Empty icon="person-add-outline" title="No pending requests" text="New requests from students appear here." /> : pending.map((r) => (
            <RequestCard key={r.id} r={r} orgId={orgId} onDone={() => { void reload(); void reloadOverview(); }} />
          ))}
          {data && data.decided.length > 0 ? (
            <>
              <SectionTitle caption="The latest approvals and rejections">Recent decisions</SectionTitle>
              <ListGroup>
                {data.decided.map((d) => (
                  <ListItem key={d.id} title={d.name} subtitle={[d.decidedAt ? fmtDate(d.decidedAt) : null, d.decidedBy ? `by ${d.decidedBy}` : null, d.note].filter(Boolean).join(" · ")}
                    right={<Badge label={d.status === "APPROVED" ? "Approved" : "Rejected"} tone={d.status === "APPROVED" ? "success" : "danger"} />} />
                ))}
              </ListGroup>
            </>
          ) : null}
        </Body>
      )}
    </View>
  );
}

function RequestCard({ r, orgId, onDone }: { r: PendingJoinRequest; orgId: string; onDone: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const decide = async (decision: "approve" | "reject") => {
    const ok = await confirm(decision === "approve"
      ? { title: `Accept ${r.name}?`, message: "They become a member of this organization.", confirmLabel: "Accept", icon: "person-add-outline" }
      : { title: `Reject ${r.name}?`, message: "They are told the request was declined and can ask again later.", confirmLabel: "Reject", tone: "danger", icon: "close-circle-outline" });
    if (!ok) return;
    setBusy(decision);
    try {
      await api.decideJoinRequest(orgId, r.id, decision, note.trim() || undefined);
      toast.show(decision === "approve" ? `${r.name} is now a member` : "Request rejected");
      onDone();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : "Something went wrong.", "error"); }
    finally { setBusy(null); }
  };
  const first = r.name.split(" ")[0] ?? "", last = r.name.split(" ").slice(-1)[0] ?? "";
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
        <Avatar first={first} last={last} size={48} />
        <View style={{ flex: 1 }}>
          <Txt variant="h3">{r.name}</Txt>
          <Txt variant="small">{[r.studentNumber, r.yearLevel ? `Year ${r.yearLevel}` : null].filter(Boolean).join(" · ") || "No student profile"}</Txt>
        </View>
      </View>
      <View style={{ gap: 2 }}>
        {r.program ? <Txt variant="body">{r.program}</Txt> : null}
        {r.department || r.college ? <Txt variant="small">{[r.department, r.college].filter(Boolean).join(" · ")}</Txt> : null}
        <Txt variant="small">{r.email}</Txt>
        <Txt variant="small">Requested {fmtDate(r.createdAt)}{r.rejectedBefore ? ` · rejected ${r.rejectedBefore} time${r.rejectedBefore === 1 ? "" : "s"} before` : ""}</Txt>
      </View>
      {r.message ? <Txt variant="body" color={colors.textSecondary}>“{r.message}”</Txt> : null}
      <Field label="Note to the student (optional)" value={note} onChangeText={setNote} maxLength={300} />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}><Button label="Reject" variant="ghost" icon="close" loading={busy === "reject"} disabled={!!busy} onPress={() => void decide("reject")} /></View>
        <View style={{ flex: 1 }}><Button label="Accept" icon="checkmark" loading={busy === "approve"} disabled={!!busy} onPress={() => void decide("approve")} /></View>
      </View>
    </Card>
  );
}
