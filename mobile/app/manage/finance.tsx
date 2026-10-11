import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api/client";
import type { Owing, OrgPayment } from "../../src/api/types";
import { Field, ProgressBar, Sheet, StatTile, TileGrid, useToast } from "../../src/components/kit";
import { Badge, Body, Button, Card, Chips, Empty, ErrorState, Loading, ScreenHeader, SectionTitle, type Tone } from "../../src/components/ui";
import { fmtDate, peso } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { colors, space, type } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

type Tab = "overview" | "pending" | "owing" | "recent";
const PAY: Record<string, [string, Tone]> = { CONFIRMED: ["Confirmed", "success"], PENDING: ["Pending", "warning"], REJECTED: ["Rejected", "danger"] };
const METHOD: Record<string, string> = { CASH: "Cash", GCASH: "GCash", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };

/** Organization finance. Everyone who may see it gets the read-only views; verify / record controls appear only with fees.manage. */
export default function Finance() {
  const router = useRouter();
  const toast = useToast();
  const { org, reloadOverview } = useOrg();
  const orgId = org?.id ?? "";
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>((["overview", "pending", "owing", "recent"] as const).find((t) => t === params.tab) ?? "overview");
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgFinance(orgId), [orgId]);
  const [rejecting, setRejecting] = useState<OrgPayment | null>(null);
  const [reason, setReason] = useState("");
  const [recording, setRecording] = useState<Owing | null>(null);
  const [busy, setBusy] = useState(false);

  async function act<T>(run: () => Promise<T>, done: string) {
    setBusy(true);
    try {
      await run();
      toast.show(done);
      await Promise.all([refresh(), reloadOverview()]);
      return true;
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Something went wrong.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const approve = (p: OrgPayment) =>
    Alert.alert("Confirm this payment?", `${p.member} · ${peso(p.amount)} (${METHOD[p.method] ?? p.method})\nIt will reduce their balance.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm payment", onPress: () => void act(() => api.decidePayment(orgId, p.id, "approve"), "Payment confirmed") },
    ]);

  const list = (rows: OrgPayment[], manage: boolean) =>
    rows.length === 0 ? <Empty icon="receipt-outline" title="Nothing here" /> : rows.map((p) => {
      const st = PAY[p.status] ?? [p.status, "muted" as Tone];
      return (
        <Card key={p.id} style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={type.h2} numberOfLines={1}>{p.member}</Text>
              <Text style={type.small} numberOfLines={1}>{p.fee} · {METHOD[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</Text>
              <Text style={type.small}>{fmtDate(p.at)} · {p.receiptCode}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={[type.h2, { fontVariant: ["tabular-nums"] }]}>{peso(p.amount)}</Text>
              <Badge label={st[0]} tone={st[1]} />
            </View>
          </View>
          {manage && p.status === "PENDING" ? (
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}><Button label="Reject" variant="danger" disabled={busy} onPress={() => { setReason(""); setRejecting(p); }} /></View>
              <View style={{ flex: 1 }}><Button label="Confirm" icon="checkmark" disabled={busy} onPress={() => approve(p)} /></View>
            </View>
          ) : null}
        </Card>
      );
    });

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Finance" subtitle={org?.name} back={() => router.back()}>
        <Chips<Tab>
          value={tab} onChange={setTab}
          options={[
            { value: "overview", label: "Overview" },
            { value: "pending", label: data ? `To verify${data.pending.length ? ` (${data.pending.length})` : ""}` : "To verify" },
            { value: "owing", label: "Balances" },
            { value: "recent", label: "Recent" },
          ]}
        />
      </ScreenHeader>
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : data ? (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {!data.canManage ? <Badge label="Read-only access" tone="muted" /> : null}

          {tab === "overview" && (
            <>
              <Card style={{ gap: space.sm }}>
                <Text style={type.caption}>COLLECTED</Text>
                <Text style={[type.display, { fontVariant: ["tabular-nums"] }]} adjustsFontSizeToFit numberOfLines={1}>{peso(data.totals.collected)}</Text>
                {data.totals.collectionRate !== null ? (<><ProgressBar value={data.totals.collectionRate} /><Text style={type.small}>{data.totals.collectionRate}% of the {peso(data.totals.assessed)} assessed</Text></>) : <Text style={type.small}>Nothing has been assessed yet.</Text>}
              </Card>
              <TileGrid>
                <StatTile icon="receipt" tone="blue" label="Assessed" value={peso(data.totals.assessed)} sub={`${data.totals.assessments} assessments`} />
                <StatTile icon="alert-circle" tone="orange" label="Outstanding" value={peso(data.totals.outstanding)} sub={`${data.totals.membersWithBalance} members`} onPress={() => setTab("owing")} />
                <StatTile icon="time" tone="warning" label="Awaiting verification" value={peso(data.totals.pendingVerification)} sub={`${data.pending.length} payments`} onPress={() => setTab("pending")} />
                <StatTile icon="people" tone="violet" label="Members assessed" value={String(data.totals.membersAssessed)} />
              </TileGrid>
              <Text style={type.small}>Computed from every assessment in this organization: amount plus adjustments, minus confirmed payments. Pending and voided payments are not counted as collected.</Text>
            </>
          )}

          {tab === "pending" && (
            <>
              <SectionTitle>Payments waiting for verification</SectionTitle>
              {list(data.pending, data.canManage)}
            </>
          )}

          {tab === "owing" && (
            <>
              <SectionTitle>Members with an outstanding balance</SectionTitle>
              {data.owing.length === 0 ? <Empty icon="checkmark-circle-outline" title="No outstanding balances" /> : data.owing.map((o) => (
                <Card key={o.userId} onPress={data.canManage ? () => setRecording(o) : undefined} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.h2} numberOfLines={1}>{o.name}</Text>
                    <Text style={type.small}>{o.studentNumber ?? "No student number"} · paid {peso(o.paid)} of {peso(o.due)}</Text>
                    {data.canManage ? <Text style={[type.caption, { color: colors.blue, marginTop: 2 }]}>Tap to record a payment</Text> : null}
                  </View>
                  <Text style={[type.h2, { color: colors.orange, fontVariant: ["tabular-nums"] }]}>{peso(o.balance)}</Text>
                </Card>
              ))}
              {data.owingTruncated ? <Text style={type.small}>Showing the 200 largest balances. Use the web app for the complete list.</Text> : null}
            </>
          )}

          {tab === "recent" && (
            <>
              <SectionTitle>Recent payment activity</SectionTitle>
              {list(data.recent, false)}
            </>
          )}
        </Body>
      ) : null}

      <Sheet visible={!!rejecting} onClose={() => setRejecting(null)} title="Reject payment">
        <Text style={type.body}>{rejecting?.member} · {rejecting ? peso(rejecting.amount) : ""}</Text>
        <Field label="Reason (shown to the member)" value={reason} onChangeText={setReason} multiline maxLength={300} placeholder="e.g. Reference number does not match" />
        <Button label="Reject payment" variant="danger" loading={busy} disabled={reason.trim().length < 3} onPress={async () => { if (rejecting && (await act(() => api.decidePayment(orgId, rejecting.id, "reject", reason.trim()), "Payment rejected"))) setRejecting(null); }} />
      </Sheet>

      {recording ? <RecordSheet owing={recording} busy={busy} onClose={() => setRecording(null)} onSubmit={async (feeId, amount, method, ref) => { if (await act(() => api.recordPayment(orgId, feeId, amount, method, ref), "Payment recorded")) setRecording(null); }} /> : null}
    </View>
  );
}

function RecordSheet({ owing, busy, onClose, onSubmit }: { owing: Owing; busy: boolean; onClose: () => void; onSubmit: (feeId: string, amount: string, method: "CASH" | "GCASH" | "BANK_TRANSFER" | "OTHER", ref?: string) => void }) {
  const [feeId, setFeeId] = useState(owing.fees[0]?.id ?? "");
  const fee = owing.fees.find((f) => f.id === feeId);
  const [amount, setAmount] = useState(fee?.balance ?? "");
  const [method, setMethod] = useState<"CASH" | "GCASH" | "BANK_TRANSFER" | "OTHER">("CASH");
  const [ref, setRef] = useState("");
  return (
    <Sheet visible onClose={onClose} title="Record payment">
      <Text style={type.body}>{owing.name}{owing.studentNumber ? ` · ${owing.studentNumber}` : ""}</Text>
      {owing.fees.length > 1 ? (
        <View style={{ gap: 6 }}>
          <Text style={type.caption}>FEE</Text>
          {owing.fees.map((f) => (
            <Card key={f.id} onPress={() => { setFeeId(f.id); setAmount(f.balance); }} style={{ padding: space.md, borderColor: f.id === feeId ? colors.blue : colors.border, borderWidth: f.id === feeId ? 2 : 1 }}>
              <Text style={type.body}>{f.title}</Text>
              <Text style={type.small}>Balance {peso(f.balance)}</Text>
            </Card>
          ))}
        </View>
      ) : fee ? <Text style={type.small}>{fee.title} · balance {peso(fee.balance)}</Text> : null}
      <Field label="Amount (₱)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Chips<"CASH" | "GCASH" | "BANK_TRANSFER" | "OTHER"> value={method} onChange={setMethod} options={[{ value: "CASH", label: "Cash" }, { value: "GCASH", label: "GCash" }, { value: "BANK_TRANSFER", label: "Bank" }, { value: "OTHER", label: "Other" }]} />
      {method !== "CASH" ? <Field label="Reference (optional)" value={ref} onChangeText={setRef} maxLength={100} /> : null}
      <Text style={type.small}>Recorded payments are confirmed immediately and get a receipt code. The server rejects amounts above the balance.</Text>
      <Button label="Record payment" loading={busy} disabled={!feeId || !/^\d{1,8}(\.\d{1,2})?$/.test(amount.trim())} onPress={() => onSubmit(feeId, amount.trim(), method, ref.trim() || undefined)} />
    </Sheet>
  );
}
