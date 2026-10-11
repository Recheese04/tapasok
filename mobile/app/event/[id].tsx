import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/client";
import { Badge, Body, Button, Card, DateBlock, ErrorState, IconChip, Loading, ScreenHeader, SectionTitle, Txt, type Tone } from "../../src/components/ui";
import { dayLabel, fmtDate, fmtTime, fmtTimeRange } from "../../src/format";
import { colors, space } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

const STATUS: Record<string, [string, Tone, "checkmark-circle" | "time" | "close-circle" | "document-text"]> = {
  PRESENT: ["Present", "success", "checkmark-circle"], LATE: ["Late", "warning", "time"], ABSENT: ["Absent", "danger", "close-circle"], EXCUSED: ["Excused", "info", "document-text"],
};

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.event(id));
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={data?.organization ?? "Event"} title={data?.title ?? "Event"} back={() => router.back()} />
      {loading && !data ? <Loading hero /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : data ? (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          <Card style={{ gap: space.lg }}>
            <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
              <DateBlock iso={data.startsAt} tone="accent" size={60} />
              <View style={{ flex: 1 }}>
                <Txt variant="h2">{dayLabel(data.startsAt)}</Txt>
                <Txt variant="small">{fmtTimeRange(data.startsAt, data.endsAt)}</Txt>
                {data.status === "CANCELLED" ? <View style={{ marginTop: 4 }}><Badge label="Cancelled" tone="danger" /></View> : null}
              </View>
            </View>
            {data.venue ? <Meta icon="location" text={data.venue} /> : null}
            <Meta icon="people" text={data.organization} />
            {data.creator ? <Meta icon="person" text={`Posted by ${data.creator}`} /> : null}
          </Card>
          {data.description ? (
            <Card style={{ gap: space.sm }}>
              <Txt variant="caption">About this event</Txt>
              <Txt variant="body" color={colors.textSecondary}>{data.description}</Txt>
            </Card>
          ) : null}

          <SectionTitle caption="Check in by scanning the code shown by the organizer">Attendance</SectionTitle>
          {data.sessions.map((s) => {
            const mine = s.myStatus ? STATUS[s.myStatus] : null;
            return (
              <Card key={s.id} style={{ gap: space.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                  <IconChip name={mine ? mine[2] : s.open ? "scan" : "time-outline"} tone={mine ? mine[1] : s.open ? "accent" : "neutral"} size={42} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3">{s.label}</Txt>
                    <Txt variant="small">{fmtDate(s.opensAt)} · {fmtTime(s.opensAt)} – {fmtTime(s.closesAt)}</Txt>
                  </View>
                  {mine ? <Badge label={mine[0]} tone={mine[1]} dot /> : s.open ? <Badge label="Open now" tone="accent" dot /> : <Badge label="Not open" tone="neutral" />}
                </View>
                {s.open && !mine ? <Button label="Scan to check in" icon="scan" onPress={() => router.navigate("/scan")} /> : null}
              </Card>
            );
          })}
        </Body>
      ) : null}
    </View>
  );
}

function Meta({ icon, text }: { icon: "location" | "people" | "person"; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Txt variant="small" style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}
