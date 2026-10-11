import { useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../src/api/client";
import { Badge, Body, Card, Empty, ErrorState, Loading, ScreenHeader } from "../../src/components/ui";
import { roleLabel } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { colors, radius, space, type } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

/** Member list of the active organization (members.basic). Emails are shown only to positions the server allows. */
export default function Members() {
  const router = useRouter();
  const { org } = useOrg();
  const orgId = org?.id ?? "";
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgMembers(orgId), [orgId]);
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.members ?? []).filter((m) => !t || m.name.toLowerCase().includes(t) || (m.studentNumber ?? "").toLowerCase().includes(t));
  }, [data, q]);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Members" subtitle={org?.name} back={() => router.back()}>
        <TextInput
          value={q} onChangeText={setQ} placeholder="Search name or student number" placeholderTextColor={colors.onBlueMuted} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search members"
          style={{ minHeight: 44, borderRadius: radius.pill, paddingHorizontal: space.lg, backgroundColor: "rgba(255,255,255,0.16)", color: colors.white, fontSize: 15 }}
        />
      </ScreenHeader>
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          <Text style={type.small}>{rows.length} of {data?.members.length ?? 0} members</Text>
          {rows.length === 0 ? <Empty icon="people-outline" title="No members found" /> : rows.map((m) => (
            <Card key={m.userId + m.role} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }}>
              <View style={{ flex: 1 }}>
                <Text style={type.h2} numberOfLines={1}>{m.name}</Text>
                <Text style={type.small} numberOfLines={1}>{m.studentNumber ?? "No student number"}{m.yearLevel ? ` · Year ${m.yearLevel}` : ""}</Text>
                {m.email ? <Text style={type.small} numberOfLines={1}>{m.email}</Text> : null}
              </View>
              {m.role !== "MEMBER" ? <Badge label={roleLabel(m.role, m.title)} tone="violet" /> : null}
            </Card>
          ))}
        </Body>
      )}
    </View>
  );
}
