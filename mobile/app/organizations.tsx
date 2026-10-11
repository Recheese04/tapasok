import { View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api/client";
import { useOrg } from "../src/org/OrgContext";
import { Badge, Body, Button, Card, Empty, ErrorState, Loading, ScreenHeader, Txt } from "../src/components/ui";
import { roleLabel } from "../src/format";
import { colors, fonts, space } from "../src/theme";
import { useLoad } from "../src/useLoad";

const SCOPE: Record<string, string> = { DEPARTMENTAL: "Departmental", COLLEGE_WIDE: "College-wide", UNIVERSITY_WIDE: "University-wide" };

export default function Organizations() {
  const router = useRouter();
  const { org: active, setActiveOrgId } = useOrg();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.organizations);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow="Membership" title="My organizations" back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {data?.organizations.length === 0 ? <Empty icon="people-outline" title="No organizations yet" text="Ask an officer to add you, or join with a code on the website." /> : data?.organizations.map((o) => {
            const on = active?.id === o.id;
            const officer = o.positions.some((p) => p.role !== "MEMBER");
            return (
              <Card key={o.id} style={[{ gap: space.md }, on && { borderColor: colors.primary, borderWidth: 2 }]}>
                <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                  <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: officer ? colors.navy900 : colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                    <Txt style={{ fontFamily: fonts.extrabold, fontSize: 16 }} color={officer ? colors.accent : colors.primaryInk}>{(o.acronym ?? o.name).slice(0, 3).toUpperCase()}</Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3" numberOfLines={2}>{o.name}</Txt>
                    <Txt variant="small">{[SCOPE[o.scope] ?? null, `${o.memberCount} members`].filter(Boolean).join(" · ")}</Txt>
                  </View>
                </View>
                {o.description ? <Txt variant="body" color={colors.textSecondary} numberOfLines={4}>{o.description}</Txt> : null}
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  {o.positions.map((p, i) => <Badge key={i} label={roleLabel(p.role, p.title)} tone={p.role === "MEMBER" ? "neutral" : "violet"} icon={p.role === "MEMBER" ? "person" : "ribbon"} />)}
                  {on ? <Badge label="Active on Home" tone="primary" icon="checkmark" /> : null}
                </View>
                {!on ? <Button label="Show on Home" variant="ghost" size="sm" onPress={() => { setActiveOrgId(o.id); router.navigate("/"); }} /> : null}
              </Card>
            );
          })}
        </Body>
      )}
    </View>
  );
}
