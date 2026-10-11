import { View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api/client";
import type { Fee } from "../src/api/types";
import { Notice } from "../src/components/kit";
import { Badge, Body, Card, Divider, Empty, ErrorState, KeyValue, Loading, ProgressBar, ScreenHeader, SectionTitle, Txt, type Tone } from "../src/components/ui";
import { fmtDate, peso } from "../src/format";
import { colors, space } from "../src/theme";
import { useLoad } from "../src/useLoad";

const FEE: Record<string, [string, Tone]> = { PAID: ["Paid", "success"], PARTIAL: ["Partly paid", "warning"], UNPAID: ["Unpaid", "danger"], CREDIT: ["Credit", "info"] };
const PAY: Record<string, [string, Tone]> = { CONFIRMED: ["Confirmed", "success"], PENDING: ["Awaiting treasurer", "warning"], REJECTED: ["Rejected", "danger"] };
const METHOD: Record<string, string> = { CASH: "Cash", GCASH: "GCash", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };

function FeeCard({ f }: { f: Fee }) {
  const st = FEE[f.status] ?? [f.status, "neutral" as Tone];
  const due = Number(f.amountDue) + Number(f.adjustments);
  const pct = due > 0 ? Math.min(100, (Number(f.paid) / due) * 100) : 100;
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Txt variant="h3">{f.title}</Txt>
          <Txt variant="small">{f.organization}{f.dueDate ? ` · due ${fmtDate(f.dueDate)}` : ""}</Txt>
        </View>
        <Badge label={st[0]} tone={st[1]} dot />
      </View>
      <ProgressBar value={pct} tone={st[1] === "success" ? "success" : "primary"} />
      <View style={{ gap: 2 }}>
        <KeyValue label="Amount" value={peso(f.amountDue)} />
        {Number(f.adjustments) !== 0 ? <KeyValue label="Adjustments" value={peso(f.adjustments)} /> : null}
        <KeyValue label="Paid" value={peso(f.paid)} color={colors.successInk} />
        {Number(f.pending) > 0 ? <KeyValue label="Awaiting confirmation" value={peso(f.pending)} color={colors.warningInk} /> : null}
      </View>
      <Divider />
      <KeyValue label="Balance" value={peso(f.balance)} strong color={Number(f.balance) > 0 ? colors.dangerInk : colors.successInk} />
      {f.payments.length ? (
        <View style={{ gap: space.sm, marginTop: space.xs }}>
          <Txt variant="caption">Payments</Txt>
          {f.payments.map((p) => {
            const ps = PAY[p.status] ?? [p.status, "neutral" as Tone];
            return (
              <View key={p.id} style={{ flexDirection: "row", gap: space.md, alignItems: "center", padding: space.md, borderRadius: 14, backgroundColor: colors.surfaceAlt }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" style={{ fontVariant: ["tabular-nums"] }}>{peso(p.amount)} <Txt variant="small">· {METHOD[p.method] ?? p.method}</Txt></Txt>
                  <Txt variant="small" color={colors.textMuted}>{fmtDate(p.paidAt)} · {p.receiptCode}</Txt>
                  {p.rejectionReason ? <Txt variant="small" color={colors.dangerInk}>{p.rejectionReason}</Txt> : null}
                </View>
                <Badge label={ps[0]} tone={ps[1]} />
              </View>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

/** The signed-in member's own fees only. Officers see the same personal view; organization finance is under Manage. */
export default function Fees() {
  const router = useRouter();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.fees);
  const balance = (data?.fees ?? []).reduce((s, f) => s + Math.max(0, Number(f.balance)), 0);
  const pending = (data?.fees ?? []).reduce((s, f) => s + Number(f.pending), 0);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow="Personal" title="My fees and payments" back={() => router.back()} />
      {loading && !data ? <Loading hero /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {data && data.fees.length > 0 ? (
            <Card variant="dark" style={{ gap: space.sm, padding: space.xl }}>
              <Txt variant="caption" color={colors.onDarkMuted}>Total balance</Txt>
              <Txt variant="numberLg" color={colors.onDark}>{peso(balance)}</Txt>
              <Txt variant="small" color={colors.onDarkMuted}>{balance > 0 ? `Across ${data.fees.filter((f) => Number(f.balance) > 0).length} unpaid fee(s)` : "You are all paid up"}{pending > 0 ? ` · ${peso(pending)} awaiting confirmation` : ""}</Txt>
            </Card>
          ) : null}
          {data?.fees.length === 0 ? <Empty icon="wallet-outline" title="No fees" text="You have no fees or payments recorded." tone="success" /> : (
            <>
              <SectionTitle>Assessments</SectionTitle>
              {data?.fees.map((f) => <FeeCard key={f.id} f={f} />)}
              <Notice icon="information-circle" tone="info" title="How to pay" text="Hand cash to your treasurer, or submit a GCash or bank payment on the website. It counts once the treasurer confirms it." />
            </>
          )}
        </Body>
      )}
    </View>
  );
}
