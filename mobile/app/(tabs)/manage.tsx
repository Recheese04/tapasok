import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth/AuthContext";
import { OrgChip } from "../../src/components/kit";
import { Badge, Body, Card, ErrorState, ListGroup, ListItem, Loading, ScreenHeader, SectionTitle, Txt, type IconName } from "../../src/components/ui";
import { roleLabel } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { toolsFor } from "../../src/roles";
import { colors, space } from "../../src/theme";

/** Organization tools for the active organization. Shown only to positions with at least one capability there. */
export default function Manage() {
  const router = useRouter();
  const { me } = useAuth();
  const { org, overview, overviewLoading, overviewError, reloadOverview } = useOrg();
  const header = (
    <ScreenHeader eyebrow="Organization tools" title="Manage" avatar={me ? { first: me.firstName, last: me.lastName } : undefined} onAvatar={() => router.navigate("/account")}>
      <OrgChip />
    </ScreenHeader>
  );
  if (!overview) return <View style={{ flex: 1 }}>{header}{overviewError && !overviewLoading ? <ErrorState error={overviewError} onRetry={() => void reloadOverview()} /> : <Loading />}</View>;

  const tools = toolsFor(overview);
  const c = overview.capabilities;
  const can: [boolean, string][] = [
    [c["fees.manage"], "Verify payments and record payments"],
    [c["fees.view_org"] && !c["fees.manage"], "View financial records (read-only)"],
    [c["events.manage"], "Create and publish events, open check-in"],
    [c["announcements.manage"], "Post announcements to members"],
    [c["documents.manage"], "Organization documents"],
    [c["members.basic"], "Member list"],
    [c["attendance.view_org"], "Organization attendance"],
  ];

  return (
    <View style={{ flex: 1 }}>
      {header}
      <Body onRefresh={() => void reloadOverview()} refreshing={overviewLoading}>
        <Card variant="dark" style={{ gap: space.md, padding: space.xl }}>
          <Txt variant="caption" color={colors.onDarkMuted}>Your position in {org?.acronym ?? org?.name}</Txt>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {overview.roles.map((r, i) => <Badge key={i} label={roleLabel(r.role, r.title)} tone="accent" icon="ribbon" />)}
          </View>
          <View style={{ gap: 6 }}>
            {can.filter(([on]) => on).map(([, label]) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                <Txt variant="small" color={colors.onDark}>{label}</Txt>
              </View>
            ))}
          </View>
        </Card>

        <SectionTitle caption="Everything here applies to the selected organization only">Tools</SectionTitle>
        <ListGroup>
          {tools.map((t) => (
            <ListItem key={t.key} icon={t.icon as IconName} tone={t.tone} title={t.label} subtitle={t.sub}
              right={t.badge ? <Badge label={String(t.badge)} tone="danger" /> : undefined} onPress={() => router.push(t.route as Href)} />
          ))}
        </ListGroup>
        <Txt variant="small" color={colors.textMuted} align="center" style={{ marginTop: space.sm }}>Your own events, attendance and fees stay on the other tabs in every organization.</Txt>
      </Body>
    </View>
  );
}
