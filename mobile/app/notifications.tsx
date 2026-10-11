import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { api, ApiError } from "../src/api/client";
import type { Notice as NoticeItem } from "../src/api/types";
import { useAuth } from "../src/auth/AuthContext";
import { useToast } from "../src/components/kit";
import { Body, Button, Empty, ErrorState, ListGroup, ListItem, Loading, ScreenHeader, SectionTitle, type IconName, type Tone } from "../src/components/ui";
import { ago } from "../src/format";
import { colors } from "../src/theme";
import { useLoad } from "../src/useLoad";

const KIND: Record<string, [IconName, Tone]> = { announcement: ["megaphone", "teal"], payment: ["wallet", "accent"], event: ["calendar", "violet"], attendance: ["checkmark-done", "success"] };

export default function Notifications() {
  const router = useRouter();
  const toast = useToast();
  const { refreshMe } = useAuth();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.notifications);
  const [busy, setBusy] = useState(false);
  const list = data?.notifications ?? [];
  const unread = list.filter((n) => !n.read);
  const today = list.filter((n) => Date.now() - new Date(n.at).getTime() < 86_400_000);
  const earlier = list.filter((n) => Date.now() - new Date(n.at).getTime() >= 86_400_000);

  async function readAll() {
    setBusy(true);
    try { await api.markAllRead(); await Promise.all([refresh(), refreshMe()]); toast.show("All caught up"); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : "Something went wrong.", "error"); }
    finally { setBusy(false); }
  }
  const item = (n: NoticeItem) => {
    const [icon, tone] = KIND[n.kind] ?? ["notifications", "primary" as Tone];
    return (
      <ListItem key={n.id} icon={icon} tone={n.read ? "neutral" : tone} title={n.title} subtitle={n.body ?? undefined} meta={ago(n.at)} chevron={false}
        right={!n.read ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} accessibilityLabel="Unread" /> : undefined}
        accessibilityLabel={`${n.read ? "" : "Unread. "}${n.title}`} />
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={unread.length ? `${unread.length} unread` : "Up to date"} title="Notifications" back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {unread.length ? <Button label="Mark all as read" variant="secondary" icon="checkmark-done" loading={busy} onPress={() => void readAll()} /> : null}
          {list.length === 0 ? <Empty icon="notifications-outline" title="You're all caught up" text="Payment updates, announcements and event news appear here." tone="success" /> : null}
          {today.length ? <><SectionTitle>Today</SectionTitle><ListGroup>{today.map(item)}</ListGroup></> : null}
          {earlier.length ? <><SectionTitle>Earlier</SectionTitle><ListGroup>{earlier.map(item)}</ListGroup></> : null}
        </Body>
      )}
    </View>
  );
}
