import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../src/api/client";
import { Badge, Body, Button, Card, ErrorState, Loading, ScreenHeader, SectionTitle, type Tone } from "../../src/components/ui";
import { fmtDate, fmtRange, fmtTime } from "../../src/format";
import { space, type } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

const STATUS: Record<string, [string, Tone]> = { PRESENT: ["Present", "success"], LATE: ["Late", "warning"], ABSENT: ["Absent", "danger"], EXCUSED: ["Excused", "blue"] };

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.event(id));
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={data?.title ?? "Event"} subtitle={data?.organization} back={() => router.back()} />
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data ? (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          <Card style={{ gap: 6 }}>
            <Text style={type.h2}>{fmtRange(data.startsAt, data.endsAt)}</Text>
            {data.venue ? <Text style={type.body}>{data.venue}</Text> : null}
            {data.description ? <Text style={[type.body, { marginTop: space.sm }]}>{data.description}</Text> : null}
            {data.creator ? <Text style={[type.small, { marginTop: space.sm }]}>Posted by {data.creator}</Text> : null}
          </Card>
          <SectionTitle>Attendance sessions</SectionTitle>
          {data.sessions.map((s) => {
            const mine = s.myStatus ? STATUS[s.myStatus] : null;
            return (
              <Card key={s.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={type.h2}>{s.label}</Text>
                  {mine ? <Badge label={mine[0]} tone={mine[1]} /> : s.open ? <Badge label="Open now" tone="success" /> : <Badge label="Not open" tone="muted" />}
                </View>
                <Text style={type.small}>{fmtDate(s.opensAt)}, {fmtTime(s.opensAt)} – {fmtTime(s.closesAt)}</Text>
                {s.open && !mine ? <Button label="Scan to check in" icon="qr-code" onPress={() => router.navigate("/scan")} /> : null}
              </Card>
            );
          })}
        </Body>
      ) : null}
    </View>
  );
}
