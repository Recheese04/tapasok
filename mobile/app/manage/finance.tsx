import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api/client";
import type { Owing, OrgPayment } from "../../src/api/types";
import { Field, Notice, Sheet, useConfirm, useToast } from "../../src/components/kit";
import { METHOD, PaymentItem } from "../../src/components/officer";
import {
  Avatar, Badge, BarChart, Body, Button, Card, Chips, Empty, ErrorState, ListGroup, Loading, ProgressBar, ScreenHeader, SectionTitle, SegmentBar, StatTile, TileGrid, Txt,
} from "../../src/components/ui";
import { ago, peso, pesoShort } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { colors, space } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

type Tab = "overview" | "pending" | "owing" | "recent";
type Method = "CASH" | "GCASH" | "BANK_TRANSFER" | "OTHER";

/** Organization finance. Everyone who may see it gets the read-only views; verify / record controls appear only with fees.manage. */
export default function Finance() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { org, overview, reloadOverview } = useOrg();
  const orgId = org?.id ?? "";
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>((["overview", "pending", "owing", "recent"] as const).find((t) => t === params.tab) ?? "overview");
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgFinance(orgId), [orgId]);
  const [rejecting, setRejecting] = useState<OrgPayment | null>(null);
  const [reason, setReason] = useState("");
  const [recording, setRecording] = useState<Owing | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(run: () => Promise<unknown>, done: string) {
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

  async function approve(p: OrgPayment) {
    const ok = await confirm({ title: "Confirm this payment?", message: `${p.member} · ${peso(p.amount)} by ${METHOD[p.method] ?? p.method}${p.reference ? ` (ref ${p.reference})` : ""}. It will reduce their balance and they will be notified.`, confirmLabel: "Confirm payment", icon: "shield-checkmark-outline" });
    if (ok) await act(() => api.decidePayment(orgId, p.id, "approve"), "Payment confirmed");
  }

  const t = data?.totals;
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={org?.name} title="Finance" back={() => router.back()} right={data && !data.canManage ? <Badge label="Read-only" tone="neutral" icon="eye" /> : undefined}>
        <Chips<Tab> onDark value={tab} onChange={setTab} options={[
          { value: "overview", label: "Overview" },
          { value: "pending", label: "To verify", count: data?.pending.length },
          { value: "owing", label: "Balances", count: data?.owing.length },
          { value: "recent", label: "Activity" },
        ]} />
      </ScreenHeader>
      {loading && !data ? <Loading hero /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : data && t ? (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {tab === "overview" && (
            <>
              <Card variant="dark" style={{ gap: space.lg, padding: space.xl }}>
                <Txt variant="caption" color={colors.onDarkMuted}>Total collected</Txt>
                <View>
                  <Txt variant="numberLg" color={colors.onDark} numberOfLines={1} adjustsFontSizeToFit>{peso(t.collected)}</Txt>
                  <Txt variant="small" color={colors.onDarkMuted}>{t.collectionRate !== null ? `${t.collectionRate}% of ${peso(t.assessed)} assessed` : "Nothing has been assessed yet"}</Txt>
                </View>
                <SegmentBar onDark segments={[
                  { label: "Collected", value: Number(t.collected), display: peso(t.collected), tone: "success" },
                  { label: "Awaiting", value: Number(t.pendingVerification), display: peso(t.pendingVerification), tone: "accent" },
                  { label: "Outstanding", value: Number(t.outstanding), display: peso(t.outstanding), tone: "danger" },
                ]} />
              </Card>
              <TileGrid>
                <StatTile icon="receipt" tone="primary" label="Assessed" value={peso(t.assessed)} sub={`${t.assessments} assessments`} />
                <StatTile icon="alert-circle" tone="danger" label="Outstanding" value={peso(t.outstanding)} sub={`${t.membersWithBalance} members`} onPress={() => setTab("owing")} />
                <StatTile icon="time" tone="warning" label="Awaiting verification" value={peso(t.pendingVerification)} sub={`${data.pending.length} payments`} onPress={() => setTab("pending")} />
                <StatTile icon="people" tone="violet" label="Members assessed" value={String(t.membersAssessed)} />
              </TileGrid>
              {overview?.finance?.byMonth ? (
                <Card style={{ gap: space.md }}>
                  <Txt variant="h3">Collections by month</Txt>
                  <BarChart data={overview.finance.byMonth.map((m) => ({ label: m.label, value: Number(m.value) }))} format={pesoShort} accessibilityLabel="Collections by month" />
                </Card>
              ) : null}
              <Notice icon="information-circle" tone="info" title="How these totals are computed" text="Every assessment in this organization: amount plus adjustments, minus confirmed payments. Pending and voided payments never count as collected." />
            </>
          )}

          {tab === "pending" && (
            data.pending.length === 0 ? <Empty icon="shield-checkmark-outline" title="Nothing to verify" text="Payments members submit by GCash or bank transfer appear here." tone="success" /> : (
              <>
                <SectionTitle caption="Oldest first">{`${data.pending.length} waiting for verification`}</SectionTitle>
                {data.pending.map((p) => (
                  <Card key={p.id} style={{ gap: space.md }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                      <Avatar first={p.member.split(" ")[0] ?? ""} last={p.member.split(" ").slice(-1)[0] ?? ""} size={42} />
                      <View style={{ flex: 1 }}>
                        <Txt variant="h3" numberOfLines={1}>{p.member}</Txt>
                        <Txt variant="small" numberOfLines={1}>{p.fee} · {ago(p.at)}</Txt>
                      </View>
                      <Txt variant="h2" style={{ fontVariant: ["tabular-nums"] }}>{peso(p.amount)}</Txt>
                    </View>
                    <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                      <Badge label={METHOD[p.method] ?? p.method} tone="info" icon="card" />
                      {p.reference ? <Badge label={`Ref ${p.reference}`} tone="neutral" /> : null}
                      <Badge label={p.receiptCode} tone="neutral" />
                    </View>
                    {data.canManage ? (
                      <View style={{ flexDirection: "row", gap: space.sm }}>
                        <View style={{ flex: 1 }}><Button label="Reject" variant="danger" size="sm" disabled={busy} onPress={() => { setReason(""); setRejecting(p); }} /></View>
                        <View style={{ flex: 1.4 }}><Button label="Confirm" icon="checkmark" size="sm" disabled={busy} onPress={() => void approve(p)} /></View>
                      </View>
                    ) : null}
                  </Card>
                ))}
              </>
            )
          )}

          {tab === "owing" && (
            data.owing.length === 0 ? <Empty icon="checkmark-circle-outline" title="No outstanding balances" text="Every assessed member is fully paid." tone="success" /> : (
              <>
                <SectionTitle caption={data.canManage ? "Tap a member to record a payment" : "Largest balance first"}>{`${data.owing.length} members with a balance`}</SectionTitle>
                {data.owing.map((o) => {
                  const due = Number(o.due);
                  const pct = due > 0 ? (Number(o.paid) / due) * 100 : 0;
                  return (
                    <Card key={o.userId} onPress={data.canManage ? () => setRecording(o) : undefined} accessibilityLabel={`${o.name}, owes ${peso(o.balance)}${data.canManage ? ". Record a payment" : ""}`} style={{ gap: space.sm }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                        <Avatar first={o.name.split(" ")[0] ?? ""} last={o.name.split(" ").slice(-1)[0] ?? ""} size={40} />
                        <View style={{ flex: 1 }}>
                          <Txt variant="bodyStrong" numberOfLines={1}>{o.name}</Txt>
                          <Txt variant="small" numberOfLines={1}>{o.studentNumber ?? "No student number"} · paid {peso(o.paid)} of {peso(o.due)}</Txt>
                        </View>
                        <Txt variant="h3" color={colors.dangerInk} style={{ fontVariant: ["tabular-nums"] }}>{peso(o.balance)}</Txt>
                      </View>
                      <ProgressBar value={pct} tone="success" height={6} />
                    </Card>
                  );
                })}
                {data.owingTruncated ? <Notice icon="information-circle" tone="info" title="Showing the 200 largest balances" text="Use the website for the complete list." /> : null}
              </>
            )
          )}

          {tab === "recent" && (
            data.recent.length === 0 ? <Empty icon="receipt-outline" title="No payment activity yet" /> : (
              <>
                <SectionTitle caption="Latest 25, voided payments excluded">Payment activity</SectionTitle>
                <ListGroup>{data.recent.map((p) => <PaymentItem key={p.id} p={p} />)}</ListGroup>
              </>
            )
          )}
        </Body>
      ) : null}

      <Sheet visible={!!rejecting} onClose={() => setRejecting(null)} title="Reject payment" subtitle={rejecting ? `${rejecting.member} · ${peso(rejecting.amount)}` : undefined}>
        <Field label="Reason" hint="The member sees this in their notifications." value={reason} onChangeText={setReason} multiline maxLength={300} placeholder="e.g. The reference number does not match our records" />
        <Button label="Reject payment" variant="danger" loading={busy} disabled={reason.trim().length < 3} onPress={async () => { if (rejecting && (await act(() => api.decidePayment(orgId, rejecting.id, "reject", reason.trim()), "Payment rejected"))) setRejecting(null); }} />
      </Sheet>

      {recording ? <RecordSheet owing={recording} busy={busy} onClose={() => setRecording(null)} onSubmit={async (feeId, amount, method, ref) => { if (await act(() => api.recordPayment(orgId, feeId, amount, method, ref), "Payment recorded")) setRecording(null); }} /> : null}
    </View>
  );
}

function RecordSheet({ owing, busy, onClose, onSubmit }: { owing: Owing; busy: boolean; onClose: () => void; onSubmit: (feeId: string, amount: string, method: Method, ref?: string) => void }) {
  const [feeId, setFeeId] = useState(owing.fees[0]?.id ?? "");
  const fee = owing.fees.find((f) => f.id === feeId);
  const [amount, setAmount] = useState(fee?.balance ?? "");
  const [method, setMethod] = useState<Method>("CASH");
  const [ref, setRef] = useState("");
  const valid = !!feeId && /^\d{1,8}(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
  return (
    <Sheet visible onClose={onClose} title="Record payment" subtitle={`${owing.name}${owing.studentNumber ? ` · ${owing.studentNumber}` : ""}`}>
      <View style={{ gap: space.sm }}>
        <Txt variant="label">Fee</Txt>
        {owing.fees.map((f) => {
          const on = f.id === feeId;
          return (
            <Card key={f.id} onPress={() => { setFeeId(f.id); setAmount(f.balance); }} accessibilityLabel={`${f.title}, balance ${peso(f.balance)}`} style={[{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md }, on && { borderColor: colors.primary, borderWidth: 2 }]}>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{f.title}</Txt>
                <Txt variant="small">Balance {peso(f.balance)}{Number(f.pending) > 0 ? ` · ${peso(f.pending)} awaiting` : ""}</Txt>
              </View>
              <Badge label={on ? "Selected" : "Select"} tone={on ? "primary" : "neutral"} />
            </Card>
          );
        })}
      </View>
      <Field label="Amount received (₱)" icon="cash-outline" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" hint="The server refuses amounts above the balance." />
      <View style={{ gap: space.sm }}>
        <Txt variant="label">Method</Txt>
        <Chips<Method> value={method} onChange={setMethod} options={[{ value: "CASH", label: "Cash" }, { value: "GCASH", label: "GCash" }, { value: "BANK_TRANSFER", label: "Bank" }, { value: "OTHER", label: "Other" }]} />
      </View>
      {method !== "CASH" ? <Field label="Reference (optional)" icon="document-text-outline" value={ref} onChangeText={setRef} maxLength={100} /> : null}
      <Button label={valid ? `Record ${peso(amount)}` : "Record payment"} icon="checkmark" size="lg" loading={busy} disabled={!valid} onPress={() => onSubmit(feeId, amount.trim(), method, ref.trim() || undefined)} />
      <Txt variant="small" color={colors.textMuted} align="center">Confirmed immediately with a receipt code.</Txt>
    </Sheet>
  );
}

