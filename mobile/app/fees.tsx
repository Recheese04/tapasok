import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api/client";
import type { Fee } from "../src/api/types";
import { Badge, Body, Card, Empty, ErrorState, Loading, ScreenHeader, type Tone } from "../src/components/ui";
import { fmtDate, peso } from "../src/format";
import { colors, space, type } from "../src/theme";
import { useLoad } from "../src/useLoad";

const FEE_STATUS: Record<string, [string, Tone]> = { PAID: ["Paid", "success"], PARTIAL: ["Partial", "warning"], UNPAID: ["Unpaid", "danger"], WAIVED: ["Waived", "blue"], OVERPAID: ["Overpaid", "teal"] };
const PAY_STATUS: Record<string, [string, Tone]> = { CONFIRMED: ["Confirmed", "success"], PENDING: ["Awaiting treasurer", "warning"], REJECTED: ["Rejected", "danger"] };
const METHOD: Record<string, string> = { CASH: "Cash", GCASH: "GCash", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };

function FeeCard({ f }: { f: Fee }) {
  const st = FEE_STATUS[f.status] ?? [f.status, "muted" as Tone];
  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={type.h2}>{f.title}</Text>
          <Text style={type.small}>{f.organization}{f.dueDate ? ` · due ${fmtDate(f.dueDate)}` : ""}</Text>
        </View>
        <Badge label={st[0]} tone={st[1]} />
      </View>
      <Line label="Amount" value={peso(f.amountDue)} />
      {Number(f.adjustments) !== 0 && <Line label="Adjustments" value={peso(f.adjustments)} />}
      <Line label="Paid" value={peso(f.paid)} />
      {Number(f.pending) > 0 && <Line label="Awaiting confirmation" value={peso(f.pending)} />}
      <Line label="Balance" value={peso(f.balance)} bold />
      {f.payments.length > 0 && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm, gap: 6 }}>
          <Text style={type.small}>Payments</Text>
          {f.payments.map((p) => {
            const ps = PAY_STATUS[p.status] ?? [p.status, "muted" as Tone];
            return (
              <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{peso(p.amount)} · {METHOD[p.method] ?? p.method}</Text>
                  <Text style={type.small}>{fmtDate(p.paidAt)} · {p.receiptCode}</Text>
                  {p.rejectionReason ? <Text style={{ color: colors.danger, fontSize: 12 }}>{p.rejectionReason}</Text> : null}
                </View>
                <Badge label={ps[0]} tone={ps[1]} />
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={bold ? type.h2 : type.small}>{label}</Text>
      <Text style={bold ? type.h2 : type.body}>{value}</Text>
    </View>
  );
}

export default function Fees() {
  const router = useRouter();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.fees);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Fees and payments" subtitle="Only your own records" back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {data?.fees.length === 0 ? <Empty icon="wallet-outline" title="No fees" text="You have no fees or payments recorded." /> : data?.fees.map((f) => <FeeCard key={f.id} f={f} />)}
          {data && data.fees.length > 0 && <Text style={type.small}>To pay, hand cash to your treasurer or use the Tapasok website. Payments count once the treasurer confirms them.</Text>}
        </Body>
      )}
    </View>
  );
}
