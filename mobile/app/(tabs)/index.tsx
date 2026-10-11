import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { OrgChip, Skeleton } from "../../src/components/kit";
import { OfficerSection } from "../../src/components/officer";
import { Badge, Body, Button, Card, Empty, ErrorState, IconChip, Loading, Row, ScreenHeader, SectionTitle } from "../../src/components/ui";
import { fmtDate, fmtRange, peso } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { hasTools } from "../../src/roles";
import { colors, space, type } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

/**
 * Home = the standard member experience for everyone ("For you"), plus an "Organization tools" section for the active
 * organization when the person's position there carries extra capabilities. Officers never lose a member feature.
 */
export default function Home() {
  const router = useRouter();
  const { me } = useAuth();
  const { org, overview, overviewLoading, overviewError, reloadOverview } = useOrg();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.home);

  const header = (
    <ScreenHeader subtitle="Welcome back" title={me?.firstName ?? ""} avatar={me ? { first: me.firstName, last: me.lastName } : undefined} onAvatar={() => router.navigate("/account")}>
      <OrgChip />
    </ScreenHeader>
  );
  if (loading && !data) return <View style={{ flex: 1 }}>{header}<Loading /></View>;
  if (error && !data) return <View style={{ flex: 1 }}>{header}<ErrorState error={error} onRetry={reload} /></View>;
  if (!data) return null;

  const next = data.nextEvents[0];
  const owes = Number(data.balanceDue) > 0;
  const tools = hasTools(overview?.capabilities);

  return (
    <View style={{ flex: 1 }}>
      {header}
      <Body refreshing={refreshing} onRefresh={() => { void refresh(); void reloadOverview(); }}>
        {/* ---- organization tools: only for the active organization, only what this position may do there */}
        {org && !overview && overviewLoading ? (
          <View style={{ gap: space.md }}><Skeleton height={20} width="55%" /><Skeleton height={96} r={18} /></View>
        ) : org && !overview && overviewError ? (
          <Card style={{ gap: space.sm }}>
            <Text style={type.h2}>Organization tools did not load</Text>
            <Text style={type.small}>Your personal information below is unaffected.</Text>
            <Button label="Try again" variant="secondary" icon="refresh" onPress={() => void reloadOverview()} />
          </Card>
        ) : tools && overview ? (
          <OfficerSection overview={overview} />
        ) : null}

        {/* ---- standard member features, always available */}
        <SectionTitle>{tools ? "For you" : "Today"}</SectionTitle>
        {data.openSessions.length > 0 && (
          <Card onPress={() => router.navigate("/scan")} style={{ backgroundColor: colors.blue, borderColor: colors.blue, flexDirection: "row", alignItems: "center", gap: space.md }}>
            <IconChip name="qr-code" tone="blue" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.white, fontWeight: "800", fontSize: 16 }}>Attendance is open</Text>
              <Text style={{ color: colors.onBlueMuted, fontSize: 13 }} numberOfLines={2}>{data.openSessions[0].eventTitle} · {data.openSessions[0].label}</Text>
            </View>
            <Badge label="Scan" tone="success" />
          </Card>
        )}

        {next ? (
          <Card onPress={() => router.push(`/event/${next.id}`)} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={type.caption}>NEXT EVENT</Text>
              <Badge label={next.organization} tone="violet" />
            </View>
            <Text style={type.h2}>{next.title}</Text>
            <Text style={type.small}>{fmtRange(next.startsAt, next.endsAt)}{next.venue ? ` · ${next.venue}` : ""}</Text>
          </Card>
        ) : (
          <Card><Empty icon="calendar-outline" title="No upcoming events" text="Events from your organizations will show up here." /></Card>
        )}

        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Stat label="Present" value={data.attendance.PRESENT} tone={colors.success} bg={colors.successSoft} />
          <Stat label="Late" value={data.attendance.LATE} tone={colors.warning} bg={colors.warningSoft} />
          <Stat label="Absent" value={data.attendance.ABSENT} tone={colors.danger} bg={colors.dangerSoft} />
        </View>

        <Row
          icon="wallet-outline" tone={owes ? "orange" : "success"}
          title={owes ? `You owe ${peso(data.balanceDue)}` : "No balance due"}
          sub={owes ? "My fees and payments" : "My fees and payments · all paid up"}
          onPress={() => router.push("/fees")}
        />

        <SectionTitle action={data.announcements.length ? "See all" : undefined} onAction={() => router.push("/announcements")}>Announcements</SectionTitle>
        {data.announcements.length === 0 ? (
          <Card><Empty icon="megaphone-outline" title="No announcements" /></Card>
        ) : (
          data.announcements.map((a) => (
            <Card key={a.id} style={{ gap: 4 }}>
              <Text style={type.caption}>{a.organization.toUpperCase()} · {fmtDate(a.at)}</Text>
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
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: 18, paddingVertical: space.md, alignItems: "center" }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={{ color: tone, fontSize: 24, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: tone, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}
