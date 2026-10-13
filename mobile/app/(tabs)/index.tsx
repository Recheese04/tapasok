import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { Notice, OrgChip } from "../../src/components/kit";
import { OfficerSection } from "../../src/components/officer";
import {
  Badge, Body, Button, Card, DateBlock, Empty, ErrorState, IconButton, ListGroup, ListItem, Loading, ScreenHeader, SectionTitle, SegmentBar, Skeleton, Txt,
} from "../../src/components/ui";
import { ago, dayLabel, fmtTimeRange, greeting, peso } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { hasPersonalFeatures, hasTools, organizationsOf } from "../../src/roles";
import { colors, radius, space } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

/**
 * Home = the standard member experience for everyone, plus an "Organization tools" section for the active organization
 * when the person's position there carries extra capabilities. Officers never lose a member feature.
 */
export default function Home() {
  const router = useRouter();
  const { me } = useAuth();
  const { org, overview, overviewLoading, overviewError, reloadOverview } = useOrg();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.home);

  const header = (
    <ScreenHeader
      eyebrow={`${greeting()},`} title={me?.firstName ?? ""}
      right={<IconButton name="notifications-outline" label={`Notifications${data?.unread ? `, ${data.unread} unread` : ""}`} onDark badge={data?.unread} onPress={() => router.push("/notifications")} />}
      avatar={me ? { first: me.firstName, last: me.lastName } : undefined} onAvatar={() => router.navigate("/account")}
    >
      <OrgChip />
    </ScreenHeader>
  );
  if (loading && !data) return <View style={{ flex: 1 }}>{header}<Loading hero /></View>;
  if (error && !data) return <View style={{ flex: 1 }}>{header}<ErrorState error={error} onRetry={reload} /></View>;
  if (!data) return null;

  const next = data.nextEvents[0];
  const owes = Number(data.balanceDue) > 0;
  const tools = hasTools(overview?.capabilities);
  const personal = hasPersonalFeatures(organizationsOf(me?.memberships ?? []));
  const a = data.attendance;
  const attended = a.PRESENT + a.LATE;
  const totalAtt = a.PRESENT + a.LATE + a.ABSENT + a.EXCUSED;
  const orgCount = new Set(me?.memberships.map((m) => m.organizationId) ?? []).size;

  return (
    <View style={{ flex: 1 }}>
      {header}
      <Body refreshing={refreshing} onRefresh={() => { void refresh(); void reloadOverview(); }}>
        {data.openSessions.length > 0 ? (
          <Card variant="dark" onPress={() => router.navigate("/scan")} accessibilityLabel={`Attendance is open for ${data.openSessions[0].eventTitle}. Scan to check in`} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="scan" size={26} color={colors.navy900} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={colors.accent}>Attendance open now</Txt>
              <Txt variant="h3" color={colors.onDark} numberOfLines={1}>{data.openSessions[0].eventTitle}</Txt>
              <Txt variant="small" color={colors.onDarkMuted} numberOfLines={1}>{data.openSessions[0].label} · tap to scan</Txt>
            </View>
          </Card>
        ) : null}

        {/* organization tools: only for the active organization, only what this position may do there */}
        {org && !overview && overviewLoading ? (
          <View style={{ gap: space.md }}><Skeleton height={20} width="55%" /><Skeleton height={170} r={radius.lg} /></View>
        ) : org && !overview && overviewError ? (
          <Card style={{ gap: space.sm }}>
            <Txt variant="h3">Organization tools did not load</Txt>
            <Txt variant="small">Your personal information below is unaffected.</Txt>
            <Button label="Try again" variant="secondary" size="sm" icon="refresh" onPress={() => void reloadOverview()} />
          </Card>
        ) : tools && overview ? <OfficerSection overview={overview} /> : null}

        {/* the standard member experience, always present */}
        <SectionTitle caption={tools && personal ? "Your own events, attendance and payments" : undefined} action={next ? "All events" : undefined} onAction={() => router.navigate("/events")}>{tools && personal ? "For you" : "Up next"}</SectionTitle>
        {next ? (
          <Card onPress={() => router.push(`/event/${next.id}`)} accessibilityLabel={`Next event ${next.title}, ${dayLabel(next.startsAt)}`} style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
            <DateBlock iso={next.startsAt} tone="accent" />
            <View style={{ flex: 1, gap: 3 }}>
              <Txt variant="h3" numberOfLines={2}>{next.title}</Txt>
              <Txt variant="small" numberOfLines={1}>{dayLabel(next.startsAt)} · {fmtTimeRange(next.startsAt, next.endsAt)}</Txt>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {next.venue ? <Badge label={next.venue} tone="neutral" icon="location" /> : null}
                <Badge label={next.organization} tone="violet" />
              </View>
            </View>
          </Card>
        ) : (
          <Card><Empty icon="calendar-clear-outline" title="No upcoming events" text="Events from your organizations will show up here." /></Card>
        )}

        {/* Personal attendance and fees: not for an Adviser-only account (read-only oversight, never an attendee). */}
        {personal ? <>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <View>
              <Txt variant="caption">My attendance</Txt>
              {totalAtt ? <Txt variant="number">{attended}<Txt variant="small" color={colors.textMuted}>{`  of ${totalAtt} sessions attended`}</Txt></Txt> : <Txt variant="bodyStrong" style={{ marginTop: 2 }}>No sessions recorded yet</Txt>}
            </View>
          </View>
          <SegmentBar segments={[
            { label: "Present", value: a.PRESENT, display: String(a.PRESENT), tone: "success" },
            { label: "Late", value: a.LATE, display: String(a.LATE), tone: "warning" },
            { label: "Absent", value: a.ABSENT, display: String(a.ABSENT), tone: "danger" },
            { label: "Excused", value: a.EXCUSED, display: String(a.EXCUSED), tone: "info" },
          ]} />
        </Card>

        {owes ? (
          <Notice icon="wallet" tone="warning" title={`You owe ${peso(data.balanceDue)}`} text="My fees and payments" onPress={() => router.push("/fees")} />
        ) : null}
        <ListGroup>
          {!owes ? <ListItem icon="wallet" tone="success" title="My fees and payments" subtitle="All paid up" onPress={() => router.push("/fees")} /> : null}
          <ListItem icon="people" tone="violet" title="My organizations" subtitle={orgCount === 1 ? "1 organization" : `${orgCount} organizations`} onPress={() => router.push("/organizations")} />
        </ListGroup>

        </> : null}

        <SectionTitle action={data.announcements.length ? "See all" : undefined} onAction={() => router.push("/announcements")}>Announcements</SectionTitle>
        {data.announcements.length === 0 ? (
          <Card><Empty icon="megaphone-outline" title="No announcements yet" text="Posts from your organizations appear here." /></Card>
        ) : data.announcements.map((x) => (
          <Card key={x.id} onPress={() => router.push("/announcements")} accessibilityLabel={`Announcement: ${x.title}`} style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: colors.tealSoft, alignItems: "center", justifyContent: "center" }}><Txt variant="smallStrong" color={colors.tealInk}>{x.organization[0]}</Txt></View>
              <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>{x.organization}</Txt>
              <Txt variant="small" color={colors.textMuted}>{ago(x.at)}</Txt>
            </View>
            <Txt variant="h3">{x.title}</Txt>
            <Txt variant="body" color={colors.textSecondary} numberOfLines={3}>{x.body}</Txt>
          </Card>
        ))}
      </Body>
    </View>
  );
}
