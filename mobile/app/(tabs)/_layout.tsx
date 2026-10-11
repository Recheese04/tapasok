import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ComponentProps } from "react";
import { useOrg } from "../../src/org/OrgContext";
import { hasTools } from "../../src/roles";
import { colors, radius } from "../../src/theme";

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const TABS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }> = {
  index: { label: "Home", icon: "home-outline", active: "home" },
  events: { label: "Events", icon: "calendar-outline", active: "calendar" },
  scan: { label: "Scan", icon: "qr-code-outline", active: "qr-code" },
  manage: { label: "Manage", icon: "briefcase-outline", active: "briefcase" },
  account: { label: "Account", icon: "person-outline", active: "person" },
};

/** Floating dark-navy bar; the active tab is a white pill showing its icon and label. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const tools = hasTools(useOrg().overview?.capabilities);
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(insets.bottom, 12) }]}>
      <View style={s.bar}>
        {state.routes.map((route, i) => {
          const t = TABS[route.name];
          if (!t || (route.name === "manage" && !tools)) return null; // Manage is hidden when the position has no organization tools
          const focused = state.index === i;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[s.tab, focused && s.tabOn]}
            >
              <Ionicons name={focused ? t.active : t.icon} size={22} color={focused ? colors.navy : "#AEB7D6"} />
              {focused ? <Text style={s.label}>{t.label}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { overview } = useOrg();
  const tools = hasTools(overview?.capabilities);
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="events" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="manage" options={{ href: tools ? undefined : null }} />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 20, right: 20, alignItems: "center" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.navy, borderRadius: radius.pill, padding: 8, width: "100%", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  tab: { flex: 1, height: 48, minWidth: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  tabOn: { backgroundColor: colors.white, flex: 2.4 },
  label: { color: colors.navy, fontWeight: "800", fontSize: 13 },
});
