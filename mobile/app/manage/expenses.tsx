import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "../../src/api/client";
import type { FundRecord } from "../../src/api/types";
import { DateTimeField, Field, Notice, Sheet, useConfirm, useToast } from "../../src/components/kit";
import { Badge, Body, Button, Card, Chips, Empty, ErrorState, IconChip, Loading, ScreenHeader, SectionTitle, SegmentBar, Txt, type Tone } from "../../src/components/ui";
import { fmtDate, peso } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { colors, space } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

const STATUS: Record<string, [string, Tone]> = { PENDING: ["Pending approval", "warning"], APPROVED: ["Approved", "success"], REJECTED: ["Rejected", "danger"], CANCELLED: ["Cancelled", "neutral"], REVERSED: ["Reversed", "neutral"] };
const EXPENSE_CATS = [["SUPPLIES", "Supplies"], ["EVENT_MATERIALS", "Event materials"], ["PRINTING", "Printing"], ["TRANSPORTATION", "Transport"], ["FOOD", "Food"], ["VENUE", "Venue"], ["SERVICES", "Services"], ["OTHER", "Other"]] as const;
const INCOME_CATS = [["OPENING_BALANCE", "Opening balance"], ["DONATION", "Donation"], ["SPONSORSHIP", "Sponsorship"], ["OTHER", "Other"]] as const;
type Filter = "all" | "PENDING" | "APPROVED";
type Ask = { record: FundRecord; action: "reject" | "cancel" | "reverse" } | null;

/** RFC 4122 v4 id for the request (lets the server ignore a double submit). */
const uuid4 = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); });
const ymdManila = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);

/**
 * Organization expenses and other funds. The Treasurer records, the President approves / rejects / reverses, the Auditor
 * and Adviser only read. Every decision is enforced (and audited) by the server; these buttons only reflect it.
 */
export default function Expenses() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { org, reloadOverview } = useOrg();
  const orgId = org?.id ?? "";
  const params = useLocalSearchParams<{ new?: string; filter?: string }>();
  const [filter, setFilter] = useState<Filter>(params.filter === "PENDING" ? "PENDING" : "all");
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgExpenses(orgId, filter === "all" ? undefined : filter), [orgId, filter]);
  const [recording, setRecording] = useState(params.new === "1");
  const [ask, setAsk] = useState<Ask>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await fn(); toast.show(done); await Promise.all([refresh(), reloadOverview()]); return true; }
    catch (e) { toast.show(e instanceof ApiError ? e.message : "Something went wrong.", "error"); return false; }
    finally { setBusy(false); }
  }
  const approve = async (r: FundRecord) => {
    if (await confirm({ title: `Approve this ${r.type === "EXPENSE" ? "expense" : "income"}?`, message: `${r.title} · ${peso(r.amount)}${r.type === "EXPENSE" ? ". It will be deducted from the available balance." : ". It will be added to the available balance."}`, confirmLabel: "Approve", icon: "shield-checkmark-outline" })) {
      await run(() => api.decideExpense(orgId, r.id, "approve"), "Approved");
    }
  };

  const s = data?.summary;
  const toDecide = data?.canApprove ? data.records.filter((r) => r.status === "PENDING" && r.recordedById !== data.me) : [];
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={org?.name} title="Expenses & funds" back={() => router.back()} right={data && !data.canRecord && !data.canApprove ? <Badge label="Read-only" tone="neutral" icon="eye" /> : undefined}>
        <Chips<Filter> onDark value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "PENDING", label: "Pending", count: s?.pendingExpenseCount }, { value: "APPROVED", label: "Approved" }]} />
      </ScreenHeader>
      {loading && !data ? <Loading hero /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : data && s ? (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          <Card variant="dark" style={{ gap: space.lg, padding: space.xl }}>
            <Txt variant="caption" color={colors.onDarkMuted}>Available balance</Txt>
            <Txt variant="numberLg" color={Number(s.available) < 0 ? "#FF9C9C" : colors.onDark} numberOfLines={1} adjustsFontSizeToFit>{peso(s.available)}</Txt>
            <SegmentBar onDark segments={[
              { label: "Collected", value: Number(s.collected), display: peso(s.collected), tone: "success" },
              { label: "Other funds", value: Number(s.otherIncome), display: peso(s.otherIncome), tone: "info" },
              { label: "Spent", value: Number(s.expenses), display: peso(s.expenses), tone: "danger" },
            ]} />
            <Txt variant="small" color={colors.onDarkMuted}>Confirmed fee payments + approved other funds − approved expenses. Pending records don&apos;t count{s.pendingExpenseCount ? ` (${s.pendingExpenseCount} pending · ${peso(s.pendingExpenses)})` : ""}.</Txt>
          </Card>

          {data.canRecord ? <Button label="Record expense or funds" icon="add" onPress={() => setRecording(true)} /> : null}

          {toDecide.length ? (
            <>
              <SectionTitle caption="You can't approve records you entered yourself">{`Waiting for your approval (${toDecide.length})`}</SectionTitle>
              {toDecide.map((r) => (
                <Card key={r.id} style={{ gap: space.md, borderColor: "#F2D79B" }}>
                  <RecordHead r={r} />
                  <View style={{ flexDirection: "row", gap: space.sm }}>
                    <View style={{ flex: 1 }}><Button label="Reject" variant="danger" size="sm" disabled={busy} onPress={() => { setReason(""); setAsk({ record: r, action: "reject" }); }} /></View>
                    <View style={{ flex: 1.4 }}><Button label="Approve" icon="checkmark" size="sm" disabled={busy} onPress={() => void approve(r)} /></View>
                  </View>
                </Card>
              ))}
            </>
          ) : null}

          <SectionTitle caption={filter === "all" ? "Newest first" : undefined}>Records</SectionTitle>
          {data.records.length === 0 ? <Empty icon="receipt-outline" title="Nothing recorded yet" text={data.canRecord ? "Record what the organization spends, and any money received besides fees." : "Expenses and other funds appear here once recorded."} tone="danger" /> : data.records.map((r) => {
            const mine = r.recordedById === data.me;
            return (
              <Card key={r.id} style={{ gap: space.sm }}>
                <RecordHead r={r} />
                {r.decisionReason ? <Txt variant="small" color={colors.textSecondary}>“{r.decisionReason}”</Txt> : null}
                {r.reversalReason ? <Txt variant="small" color={colors.textSecondary}>Reversed: “{r.reversalReason}”</Txt> : null}
                <Txt variant="small" color={colors.textMuted}>By {r.recordedBy}{r.decidedBy ? ` · ${r.status === "CANCELLED" ? "cancelled" : "decided"} by ${r.decidedBy}` : ""}{r.hasReceipt ? " · receipt on the website" : " · no receipt"}</Txt>
                {data.canRecord && mine && r.status === "PENDING" ? <Button label="Cancel record" variant="ghost" size="sm" disabled={busy} onPress={() => { setReason(""); setAsk({ record: r, action: "cancel" }); }} /> : null}
                {data.canApprove && r.status === "APPROVED" ? <Button label="Reverse" variant="ghost" size="sm" disabled={busy} onPress={() => { setReason(""); setAsk({ record: r, action: "reverse" }); }} /> : null}
              </Card>
            );
          })}
          <Notice icon="desktop-outline" tone="info" title="Receipts, reports and the audit trail" text="Attach receipts, download the financial report and review every change on the Tapasok website." />
        </Body>
      ) : null}

      <Sheet visible={!!ask} onClose={() => setAsk(null)} title={ask?.action === "reject" ? "Reject record" : ask?.action === "cancel" ? "Cancel record" : "Reverse record"} subtitle={ask ? `${ask.record.title} · ${peso(ask.record.amount)}` : undefined}>
        <Field label="Reason" hint={ask?.action === "reverse" ? "It stops counting in the balance; the record and this reason stay in the audit trail." : "Kept with the record in the audit trail."} value={reason} onChangeText={setReason} multiline maxLength={500} />
        <Button label={ask?.action === "reject" ? "Reject" : ask?.action === "cancel" ? "Cancel record" : "Reverse"} variant="danger" loading={busy} disabled={reason.trim().length < 3}
          onPress={async () => { if (ask && (await run(() => api.decideExpense(orgId, ask.record.id, ask.action, reason.trim()), ask.action === "reject" ? "Rejected" : ask.action === "cancel" ? "Cancelled" : "Reversed"))) setAsk(null); }} />
      </Sheet>

      {recording ? <RecordSheet onClose={() => setRecording(false)} onSaved={async () => { setRecording(false); toast.show("Recorded. It counts once the President approves it."); await Promise.all([refresh(), reloadOverview()]); }} orgId={orgId} /> : null}
    </View>
  );
}

function RecordHead({ r }: { r: FundRecord }) {
  const st = STATUS[r.status] ?? [r.status, "neutral" as Tone];
  const out = r.type === "EXPENSE";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <IconChip name={out ? "arrow-up" : "arrow-down"} tone={out ? "danger" : "success"} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong" numberOfLines={2}>{r.title}</Txt>
        <Txt variant="small" numberOfLines={1}>{r.categoryLabel} · {fmtDate(`${r.occurredOn}T00:00:00+08:00`)}</Txt>
        <Badge label={st[0]} tone={st[1]} dot />
      </View>
      <Txt variant="h3" color={out ? colors.dangerInk : colors.successInk} style={{ fontVariant: ["tabular-nums"] }}>{out ? "−" : "+"}{peso(r.amount)}</Txt>
    </View>
  );
}

function RecordSheet({ orgId, onClose, onSaved }: { orgId: string; onClose: () => void; onSaved: () => void }) {
  const [requestId] = useState(uuid4);
  const [type, setType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("SUPPLIES");
  const [date, setDate] = useState(new Date());
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cats = type === "EXPENSE" ? EXPENSE_CATS : INCOME_CATS;
  const valid = title.trim().length >= 3 && purpose.trim().length >= 3 && /^\d{1,7}(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
  async function save() {
    setBusy(true); setErr(null);
    try {
      await api.recordExpense(orgId, { type, title: title.trim(), amount: amount.trim(), category, occurredOn: ymdManila(date), purpose: purpose.trim(), requestId });
      onSaved();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not save. Please try again."); }
    finally { setBusy(false); }
  }
  return (
    <Sheet visible onClose={onClose} title="Record" subtitle="Saved as pending until the President approves it">
      <Chips<"EXPENSE" | "INCOME"> value={type} onChange={(t) => { setType(t); setCategory(t === "EXPENSE" ? "SUPPLIES" : "OPENING_BALANCE"); }} options={[{ value: "EXPENSE", label: "Money spent" }, { value: "INCOME", label: "Other money in" }]} />
      <Field label="Description" icon="text-outline" value={title} onChangeText={setTitle} maxLength={150} placeholder={type === "EXPENSE" ? "e.g. Tarpaulin for Foundation Day" : "e.g. Cash on hand from last semester"} />
      <Field label="Amount (₱)" icon="cash-outline" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="850.00" />
      <View style={{ gap: space.sm }}>
        <Txt variant="label">Category</Txt>
        <Chips value={category} onChange={setCategory} options={cats.map(([value, label]) => ({ value, label }))} />
      </View>
      <DateTimeField label={type === "EXPENSE" ? "Date spent" : "Date received"} value={date} onChange={(d) => setDate(d > new Date() ? new Date() : d)} />
      <Field label="Purpose or reason" value={purpose} onChangeText={setPurpose} multiline maxLength={500} />
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
        <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
        <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>Attach the receipt from the website after saving.</Txt>
      </View>
      {err ? <Notice icon="alert-circle" tone="danger" title="Not saved" text={err} /> : null}
      <Button label={valid ? `Save ${peso(amount)}` : "Save"} icon="checkmark" size="lg" loading={busy} disabled={!valid} onPress={() => void save()} />
    </Sheet>
  );
}
