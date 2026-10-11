import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrg } from "../../src/org/OrgContext";
import { hasTools } from "../../src/roles";
import { colors, elevation, fonts, radius, space } from "../../src/theme";

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const TABS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }> = {
  index: { label: "Home", icon: "home-outline", active: "home" },
  events: { label: "Events", icon: "calendar-clear-outline", active: "calendar-clear" },
  scan: { label: "Scan", icon: "scan-outline", active: "scan" },
  manage: { label: "Manage", icon: "briefcase-outline", active: "briefcase" },
  account: { label: "Account", icon: "person-circle-outline", active: "person-circle" },
};

/**
 * Floating navy bar (from the reference). The active tab becomes a white pill with its label; the others are icons with a
 * 48pt target. Manage appears only when the person's position in the active organization carries organization tools.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const tools = hasTools(useOrg().overview?.capabilities);
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(insets.bottom, space.md) }]}>
      <View style={s.bar} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const t = TABS[route.name];
          if (!t || (route.name === "manage" && !tools)) return null;
          const focused = state.index === i;
          return (
            <Pressable
              key={route.key} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: focused }}
              onPress={() => {
                const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={({ pressed }) => [s.tab, focused && s.tabOn, pressed && !focused && { opacity: 0.7 }]}
            >
              <Ionicons name={focused ? t.active : t.icon} size={22} color={focused ? colors.navy900 : colors.onDarkMuted} />
              {focused ? <Text style={s.label} numberOfLines={1}>{t.label}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const tools = hasTools(useOrg().overview?.capabilities);
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="events" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="manage" options={{ href: tools ? undefined : null }} />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: space.lg, right: space.lg, alignItems: "center" },
  bar: { flexDirection: "row", alignItems: "center", width: "100%", maxWidth: 520, backgroundColor: colors.navy900, borderRadius: radius.pill, padding: 6, gap: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", ...elevation.lg },
  tab: { flex: 1, height: 52, minWidth: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  tabOn: { backgroundColor: colors.onDark, flex: 2.3 },
  label: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.navy900 },
});
