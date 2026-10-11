import { useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/client";
import { Avatar, Badge, Body, Chips, Empty, ErrorState, ListGroup, ListItem, Loading, ScreenHeader, Txt } from "../../src/components/ui";
import { roleLabel } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { colors, fonts, radius, space } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

/** Member list of the active organization (members.basic). Emails are shown only to positions the server allows. */
export default function Members() {
  const router = useRouter();
  const { org } = useOrg();
  const orgId = org?.id ?? "";
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgMembers(orgId), [orgId]);
  const [q, setQ] = useState("");
  const [who, setWho] = useState<"all" | "officers">("all");
  const all = data?.members ?? [];
  const officers = all.filter((m) => m.role !== "MEMBER").length;
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((m) => (who === "all" || m.role !== "MEMBER") && (!t || m.name.toLowerCase().includes(t) || (m.studentNumber ?? "").toLowerCase().includes(t)));
  }, [all, q, who]);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={org?.name} title="Members" back={() => router.back()}>
        <View style={{ gap: space.md }}>
          <View style={s.search}>
            <Ionicons name="search" size={18} color={colors.onDarkMuted} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search name or student number" placeholderTextColor={colors.onDarkMuted} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search members" style={s.searchText} />
          </View>
          <Chips onDark value={who} onChange={setWho} options={[{ value: "all", label: "Everyone", count: all.length }, { value: "officers", label: "Officers", count: officers }]} />
        </View>
      </ScreenHeader>
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          <Txt variant="caption">{rows.length} of {all.length}</Txt>
          {rows.length === 0 ? <Empty icon="search-outline" title="No members found" text="Try another name or student number." /> : (
            <ListGroup>
              {rows.map((m) => (
                <View key={m.userId + m.role} style={{ flexDirection: "row", alignItems: "center", paddingLeft: space.lg }}>
                  <Avatar first={m.name.split(" ")[0] ?? ""} last={m.name.split(" ").slice(-1)[0] ?? ""} size={40} />
                  <View style={{ flex: 1 }}>
                    <ListItem title={m.name} subtitle={[m.studentNumber ?? "No student number", m.yearLevel ? `Year ${m.yearLevel}` : null].filter(Boolean).join(" · ")} meta={m.email} right={m.role !== "MEMBER" ? <Badge label={roleLabel(m.role, m.title)} tone="violet" /> : undefined} />
                  </View>
                </View>
              ))}
            </ListGroup>
          )}
        </Body>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 46, borderRadius: radius.pill, paddingHorizontal: space.lg, backgroundColor: colors.onDarkFaint, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  searchText: { flex: 1, minHeight: 44, color: colors.onDark, fontFamily: fonts.medium, fontSize: 15 },
});
