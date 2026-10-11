import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";
import { Body, Card, Empty, ErrorState, IconChip, Loading, ScreenHeader, Button } from "../src/components/ui";
import { fmtDate } from "../src/format";
import { colors, space, type } from "../src/theme";
import { useLoad } from "../src/useLoad";

export default function Notifications() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.notifications);
  const unread = data?.notifications.some((n) => !n.read);
  async function readAll() {
    await api.markAllRead();
    await Promise.all([refresh(), refreshMe()]);
  }
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Notifications" back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {unread ? <Button label="Mark all as read" variant="secondary" icon="checkmark-done" onPress={readAll} /> : null}
          {data?.notifications.length === 0 ? <Empty icon="notifications-outline" title="You are all caught up" /> : data?.notifications.map((n) => (
            <Card key={n.id} style={{ flexDirection: "row", gap: space.md, borderLeftWidth: 4, borderLeftColor: n.read ? colors.border : colors.blue }}>
              <IconChip name={n.read ? "notifications-outline" : "notifications"} tone={n.read ? "muted" : "blue"} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, !n.read && { fontWeight: "700" }]}>{n.title}</Text>
                {n.body ? <Text style={type.small}>{n.body}</Text> : null}
                <Text style={[type.small, { marginTop: 2 }]}>{fmtDate(n.at)}</Text>
              </View>
            </Card>
          ))}
        </Body>
      )}
    </View>
  );
}
