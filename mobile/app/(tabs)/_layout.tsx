import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrg } from "../../src/org/OrgContext";
import { canCheckIn, hasTools } from "../../src/roles";
import { colors, elevation, fonts, radius, space } from "../../src/theme";

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];
type Icon = keyof typeof Ionicons.glyphMap;

const TABS: Record<string, { label: string; icon: Icon; active: Icon }> = {
  index: { label: "Home", icon: "home-outline", active: "home" },
  events: { label: "Events", icon: "calendar-clear-outline", active: "calendar-clear" },
  scan: { label: "Scan", icon: "scan", active: "scan" },
  manage: { label: "Manage", icon: "briefcase-outline", active: "briefcase" },
  account: { label: "Account", icon: "person-circle-outline", active: "person-circle" },
};
const LEFT = ["index", "events"];
const RIGHT = ["manage", "account"];

/**
 * Floating navy bar. Every tab has the same width, an icon and a short label, so nothing shifts when you switch tabs; the
 * active tab gets a white pill behind its icon. Scan sits exactly in the middle as a raised gold button, with Home and Events
 * on the left and Manage (officers only) and Account on the right.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { overview, orgs } = useOrg();
  const tools = hasTools(overview?.capabilities);
  const scanVisible = canCheckIn(orgs);
  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const focused = state.routes[state.index]?.name === name;
    const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!focused && !e.defaultPrevented) navigation.navigate(name);
  };
  const current = state.routes[state.index]?.name;

  const tab = (name: string) => {
    const t = TABS[name];
    const on = current === name;
    return (
      <Pressable key={name} onPress={() => go(name)} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }} style={s.tab}>
        {/* The white pill is always mounted and only fades in or out. Toggling a view's background on Android can redraw it
            without its rounded corners after navigating back, which showed a square box. */}
        <View style={s.iconPill}>
          <View pointerEvents="none" style={[s.pillBg, { opacity: on ? 1 : 0 }]} />
          <Ionicons name={on ? t.active : t.icon} size={22} color={on ? colors.navy900 : colors.onDarkMuted} />
        </View>
        <Text style={[s.label, on && s.labelOn]} numberOfLines={1}>{t.label}</Text>
      </Pressable>
    );
  };

  const scanOn = current === "scan";
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(insets.bottom, space.md) }]}>
      {/* The navy shape is drawn under the row, so the raised Scan button stays inside the bar's touch area (Android
          ignores touches outside a view's bounds). */}
      <View style={s.bar} accessibilityRole="tablist">
        <View style={s.barBg} />
        <View style={s.side}>{LEFT.map(tab)}</View>
        {scanVisible ? <View style={s.centerSlot}>
          <Pressable onPress={() => go("scan")} accessibilityRole="tab" accessibilityLabel="Scan" accessibilityState={{ selected: scanOn }} style={[s.scan, { borderColor: scanOn ? colors.onDark : colors.bg }]}>
            <Ionicons name="scan" size={30} color={colors.navy900} />
          </Pressable>
          <Text style={[s.label, scanOn && s.labelOn]}>Scan</Text>
        </View> : null}
        <View style={s.side}>{RIGHT.filter((n) => n !== "manage" || tools).map(tab)}</View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { overview, orgs } = useOrg();
  const tools = hasTools(overview?.capabilities);
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="events" />
      <Tabs.Screen name="scan" options={{ href: canCheckIn(orgs) ? undefined : null }} />
      <Tabs.Screen name="manage" options={{ href: tools ? undefined : null }} />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

const SCAN = 64;
const s = StyleSheet.create({
  wrap: { position: "absolute", left: space.md, right: space.md, alignItems: "center" },
  bar: { flexDirection: "row", alignItems: "flex-end", width: "100%", maxWidth: 520, height: 96, paddingHorizontal: space.xs, paddingBottom: 8 },
  barBg: { position: "absolute", left: 0, right: 0, bottom: 0, height: 72, backgroundColor: colors.navy900, borderRadius: radius.xl, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", ...elevation.lg },
  side: { flex: 1, flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end" },
  tab: { flex: 1, maxWidth: 88, minHeight: 56, alignItems: "center", justifyContent: "flex-end", gap: 3 },
  iconPill: { width: 52, height: 32, alignItems: "center", justifyContent: "center" },
  pillBg: { position: "absolute", top: 0, left: 0, width: 52, height: 32, borderRadius: 16, backgroundColor: colors.onDark },
  label: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, color: colors.onDarkMuted },
  labelOn: { fontFamily: fonts.extrabold, color: colors.onDark },
  centerSlot: { width: SCAN + 20, alignItems: "center", justifyContent: "flex-end", gap: 3 },
  scan: { width: SCAN, height: SCAN, borderRadius: SCAN / 2, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", borderWidth: 5, ...elevation.md },
});
