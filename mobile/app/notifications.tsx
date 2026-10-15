import { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, ApiError } from "../src/api/client";
import type { Notice as NoticeItem } from "../src/api/types";
import { useAuth } from "../src/auth/AuthContext";
import { useConfirm, useToast } from "../src/components/kit";
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
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set()); // cleared here, hidden at once while the list reloads
  const [opened, setOpened] = useState<Set<string>>(new Set()); // tapped here, shown as read at once
  const list = (data?.notifications ?? []).filter((n) => !gone.has(n.id)).map((n) => (opened.has(n.id) ? { ...n, read: true } : n));
  const unread = list.filter((n) => !n.read);
  const today = list.filter((n) => Date.now() - new Date(n.at).getTime() < 86_400_000);
  const earlier = list.filter((n) => Date.now() - new Date(n.at).getTime() >= 86_400_000);

  async function readAll() {
    setBusy(true);
    try { await api.markAllRead(); await Promise.all([refresh(), refreshMe()]); toast.show("All caught up"); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : "Something went wrong.", "error"); }
    finally { setBusy(false); }
  }
  // Tapping a notification marks it read.
  async function open(n: NoticeItem) {
    if (n.read) return;
    setOpened((s) => new Set(s).add(n.id));
    try { await api.markRead(n.id); void refreshMe(); }
    catch { setOpened((s) => { const c = new Set(s); c.delete(n.id); return c; }); toast.show("Could not mark it as read. Check your connection.", "error"); }
  }
  async function clear(n: NoticeItem) {
    setGone((s) => new Set(s).add(n.id));
    try { await api.clearNotification(n.id); void refreshMe(); }
    catch { setGone((s) => { const c = new Set(s); c.delete(n.id); return c; }); toast.show("Could not clear it. Check your connection.", "error"); }
  }
  async function clearAll() {
    const ok = await confirm({ title: "Clear all notifications?", message: "They are removed from your list. The announcements, payments and requests they were about are not affected.", confirmLabel: "Clear all", tone: "danger", icon: "trash-outline" });
    if (!ok) return;
    setBusy(true);
    try { await api.clearAllNotifications(); await Promise.all([refresh(), refreshMe()]); toast.show("Notifications cleared"); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : "Something went wrong.", "error"); }
    finally { setBusy(false); }
  }
  const item = (n: NoticeItem) => {
    const [icon, tone] = KIND[n.kind] ?? ["notifications", "primary" as Tone];
    return (
      <ListItem key={n.id} icon={icon} tone={n.read ? "neutral" : tone} title={n.title} subtitle={n.body ?? undefined} meta={ago(n.at)} chevron={false}
        onPress={() => void open(n)}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {!n.read ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} accessibilityLabel="Unread" /> : null}
            <Pressable onPress={() => void clear(n)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Clear notification: ${n.title}`}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        }
        accessibilityLabel={`${n.read ? "" : "Unread. "}${n.title}${n.read ? "" : ". Tap to mark as read"}`} />
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={unread.length ? `${unread.length} unread` : "Up to date"} title="Notifications" back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {unread.length ? <Button label="Mark all as read" variant="secondary" icon="checkmark-done" loading={busy} onPress={() => void readAll()} /> : null}
          {list.length ? <Button label="Clear all" variant="ghost" icon="trash-outline" disabled={busy} onPress={() => void clearAll()} /> : null}
          {list.length === 0 ? <Empty icon="notifications-outline" title="You're all caught up" text="Payment updates, announcements and event news appear here." tone="success" /> : null}
          {today.length ? <><SectionTitle>Today</SectionTitle><ListGroup>{today.map(item)}</ListGroup></> : null}
          {earlier.length ? <><SectionTitle>Earlier</SectionTitle><ListGroup>{earlier.map(item)}</ListGroup></> : null}
        </Body>
      )}
    </View>
  );
}
