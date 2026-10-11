import { View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api/client";
import { Body, Card, Empty, ErrorState, Loading, ScreenHeader, Txt } from "../src/components/ui";
import { ago, fmtDate } from "../src/format";
import { colors, fonts, space } from "../src/theme";
import { useLoad } from "../src/useLoad";

export default function Announcements() {
  const router = useRouter();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.announcements);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow="From your organizations" title="Announcements" back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {data?.announcements.length === 0 ? <Empty icon="megaphone-outline" title="No announcements yet" text="Posts from your organizations appear here." tone="teal" /> : data?.announcements.map((a) => (
            <Card key={a.id} style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: "center", justifyContent: "center" }}>
                  <Txt style={{ fontFamily: fonts.extrabold, fontSize: 14 }} color={colors.tealInk}>{a.organization[0]}</Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="smallStrong" numberOfLines={1}>{a.organization}</Txt>
                  <Txt variant="small" color={colors.textMuted}>{ago(a.at)} · {fmtDate(a.at)}</Txt>
                </View>
              </View>
              <Txt variant="h2">{a.title}</Txt>
              <Txt variant="body" color={colors.textSecondary}>{a.body}</Txt>
            </Card>
          ))}
        </Body>
      )}
    </View>
  );
}
