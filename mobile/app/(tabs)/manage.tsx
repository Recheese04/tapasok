import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import type { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth/AuthContext";
import { OrgChip } from "../../src/components/kit";
import { Badge, Body, Card, ErrorState, Loading, Row, ScreenHeader, SectionTitle } from "../../src/components/ui";
import { roleLabel } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { toolsFor } from "../../src/roles";
import { space, type } from "../../src/theme";

/** Organization tools for the active organization. Shown only to positions with at least one capability there. */
export default function Manage() {
  const router = useRouter();
  const { me } = useAuth();
  const { org, overview, overviewLoading, overviewError, reloadOverview } = useOrg();
  const header = (
    <ScreenHeader subtitle="Organization tools" title="Manage" avatar={me ? { first: me.firstName, last: me.lastName } : undefined} onAvatar={() => router.navigate("/account")}>
      <OrgChip />
    </ScreenHeader>
  );
  if (!overview) return <View style={{ flex: 1 }}>{header}{overviewError && !overviewLoading ? <ErrorState error={overviewError} onRetry={() => void reloadOverview()} /> : <Loading />}</View>;

  const tools = toolsFor(overview);
  const c = overview.capabilities;
  const abilities: [boolean, string][] = [
    [c["fees.manage"], "Verify payments and record cash"],
    [c["fees.view_org"] && !c["fees.manage"], "View financial records (read-only)"],
    [c["events.manage"], "Create and publish events, open check-in"],
    [c["announcements.manage"], "Post announcements"],
    [c["documents.manage"], "Manage organization documents"],
    [c["members.basic"], "See the member list"],
    [c["attendance.view_org"], "See organization attendance"],
  ];

  return (
    <View style={{ flex: 1 }}>
      {header}
      <Body onRefresh={() => void reloadOverview()} refreshing={overviewLoading}>
        <Card style={{ gap: space.sm }}>
          <Text style={type.caption}>YOUR POSITION IN {(org?.acronym ?? org?.name ?? "").toUpperCase()}</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {overview.roles.map((r, i) => <Badge key={i} label={roleLabel(r.role, r.title)} tone={r.role === "MEMBER" ? "muted" : "violet"} />)}
          </View>
          {abilities.filter(([on]) => on).map(([, label]) => <Text key={label} style={type.small}>✓  {label}</Text>)}
        </Card>

        <SectionTitle>Tools</SectionTitle>
        {tools.map((t) => (
          <Row
            key={t.key} icon={t.icon as keyof typeof Ionicons.glyphMap} tone={t.tone} title={t.label} sub={t.sub}
            right={t.badge ? <Badge label={String(t.badge)} tone="danger" /> : undefined}
            onPress={() => router.push(t.route as Href)}
          />
        ))}
        <Text style={[type.small, { marginTop: space.sm }]}>Your own events, attendance, fees and announcements are on the other tabs and stay the same in every organization.</Text>
      </Body>
    </View>
  );
}
