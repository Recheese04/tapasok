import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { Badge, Body, Card, Empty, ErrorState, IconChip, Loading, Row, ScreenHeader, SectionTitle } from "../../src/components/ui";
import { fmtDate, fmtRange, peso } from "../../src/format";
import { colors, space, type } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

export default function Home() {
  const router = useRouter();
  const { me } = useAuth();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.home);
  const header = (
    <ScreenHeader
      subtitle="Welcome back"
      title={me?.firstName ?? ""}
      avatar={me ? { first: me.firstName, last: me.lastName } : undefined}
      onAvatar={() => router.navigate("/account")}
      right={undefined}
    />
  );
  if (loading && !data) return <View style={{ flex: 1 }}>{header}<Loading /></View>;
  if (error && !data) return <View style={{ flex: 1 }}>{header}<ErrorState error={error} onRetry={reload} /></View>;
  if (!data) return null;

  const next = data.nextEvents[0];
  const owes = Number(data.balanceDue) > 0;
  return (
    <View style={{ flex: 1 }}>
      {header}
      <Body refreshing={refreshing} onRefresh={refresh}>
        {data.openSessions.length > 0 && (
          <Card onPress={() => router.navigate("/scan")} style={{ backgroundColor: colors.blue, flexDirection: "row", alignItems: "center", gap: space.md }}>
            <IconChip name="qr-code" tone="blue" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.white, fontWeight: "800", fontSize: 16 }}>Attendance is open</Text>
              <Text style={{ color: "#C9D4FF", fontSize: 13 }} numberOfLines={2}>
                {data.openSessions[0].eventTitle} · {data.openSessions[0].label}
              </Text>
            </View>
            <Text style={{ color: colors.white, fontWeight: "800" }}>Scan</Text>
          </Card>
        )}

        <SectionTitle action={data.nextEvents.length ? "See all" : undefined} onAction={() => router.navigate("/events")}>Next event</SectionTitle>
        {next ? (
          <Card onPress={() => router.push(`/event/${next.id}`)} style={{ gap: 6 }}>
            <Badge label={next.organization} tone="violet" />
            <Text style={type.h2}>{next.title}</Text>
            <Text style={type.small}>{fmtRange(next.startsAt, next.endsAt)}</Text>
            {next.venue ? <Text style={type.small}>{next.venue}</Text> : null}
          </Card>
        ) : (
          <Card><Empty icon="calendar-outline" title="No upcoming events" text="Events from your organizations will show up here." /></Card>
        )}

        <SectionTitle>My attendance</SectionTitle>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Stat label="Present" value={data.attendance.PRESENT} tone={colors.success} bg={colors.successSoft} />
          <Stat label="Late" value={data.attendance.LATE} tone={colors.warning} bg={colors.warningSoft} />
          <Stat label="Absent" value={data.attendance.ABSENT} tone={colors.danger} bg={colors.dangerSoft} />
        </View>

        <Row
          icon="wallet-outline"
          tone={owes ? "orange" : "success"}
          title={owes ? `You owe ${peso(data.balanceDue)}` : "No balance due"}
          sub={owes ? "See your fees and payments" : "You are all paid up"}
          onPress={() => router.push("/fees")}
        />

        <SectionTitle action={data.announcements.length ? "See all" : undefined} onAction={() => router.push("/announcements")}>Announcements</SectionTitle>
        {data.announcements.length === 0 ? (
          <Card><Empty icon="megaphone-outline" title="No announcements" /></Card>
        ) : (
          data.announcements.map((a) => (
            <Card key={a.id} style={{ gap: 4 }}>
              <Text style={type.small}>{a.organization} · {fmtDate(a.at)}</Text>
              <Text style={type.h2}>{a.title}</Text>
              <Text style={type.body} numberOfLines={3}>{a.body}</Text>
            </Card>
          ))
        )}
      </Body>
    </View>
  );
}

function Stat({ label, value, tone, bg }: { label: string; value: number; tone: string; bg: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: 18, padding: space.md, alignItems: "center" }}>
      <Text style={{ color: tone, fontSize: 24, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: tone, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}
