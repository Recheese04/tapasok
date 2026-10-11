import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api/client";
import { Badge, Body, Card, Empty, ErrorState, IconChip, Loading, ScreenHeader } from "../src/components/ui";
import { roleLabel } from "../src/format";
import { space, type } from "../src/theme";
import { useLoad } from "../src/useLoad";

export default function Organizations() {
  const router = useRouter();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.organizations);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="My organizations" back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {data?.organizations.length === 0 ? <Empty icon="people-outline" title="No organizations yet" text="Ask an officer to add you to your organization." /> : data?.organizations.map((o) => (
            <Card key={o.id} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                <IconChip name="people" tone="violet" />
                <View style={{ flex: 1 }}>
                  <Text style={type.h2}>{o.name}</Text>
                  <Text style={type.small}>{o.acronym ? `${o.acronym} · ` : ""}{o.memberCount} members</Text>
                </View>
              </View>
              {o.description ? <Text style={type.body}>{o.description}</Text> : null}
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {o.positions.map((p, i) => <Badge key={i} label={roleLabel(p.role, p.title)} tone={p.role === "MEMBER" ? "muted" : "violet"} />)}
              </View>
            </Card>
          ))}
        </Body>
      )}
    </View>
  );
}
