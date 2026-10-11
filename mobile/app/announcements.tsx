import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api/client";
import { Body, Card, Empty, ErrorState, Loading, ScreenHeader } from "../src/components/ui";
import { fmtDate } from "../src/format";
import { type } from "../src/theme";
import { useLoad } from "../src/useLoad";

export default function Announcements() {
  const router = useRouter();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.announcements);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Announcements" back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {data?.announcements.length === 0 ? <Empty icon="megaphone-outline" title="No announcements" text="Posts from your organizations appear here." /> : data?.announcements.map((a) => (
            <Card key={a.id} style={{ gap: 4 }}>
              <Text style={type.small}>{a.organization} · {fmtDate(a.at)}</Text>
              <Text style={type.h2}>{a.title}</Text>
              <Text style={type.body}>{a.body}</Text>
            </Card>
          ))}
        </Body>
      )}
    </View>
  );
}
