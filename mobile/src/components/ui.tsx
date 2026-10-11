import { ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useRef, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { colors, radius, shadow, space, type } from "../theme";
import { initials } from "../format";

type IconName = keyof typeof Ionicons.glyphMap;

/** Navy gradient header: title/subtitle on the left, avatar (opens the account tab) on the right. */
export function ScreenHeader({ title, subtitle, avatar, onAvatar, back, children, right }: {
  title: string; subtitle?: string; avatar?: { first: string; last: string }; onAvatar?: () => void; back?: () => void; children?: ReactNode; right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={[colors.blueDeep, colors.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: insets.top + space.md }]}>
      <View style={s.headerRow}>
        {back && (
          <Pressable onPress={back} hitSlop={12} accessibilityLabel="Go back" accessibilityRole="button" style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          {subtitle ? <Text style={s.headerSub}>{subtitle}</Text> : null}
          <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        </View>
        {right}
        {avatar && (
          <Pressable onPress={onAvatar} accessibilityRole="button" accessibilityLabel="Open account" style={s.avatar}>
            <Text style={s.avatarText}>{initials(avatar.first, avatar.last)}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </LinearGradient>
  );
}

/** Scrollable screen body over the light gray background, with pull-to-refresh. Leaves room for the floating tab bar. */
export function Body({ children, refreshing, onRefresh, tabs = true, ...rest }: ScrollViewProps & { refreshing?: boolean; onRefresh?: () => void; tabs?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      {...rest}
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: (tabs ? 110 : 32) + insets.bottom }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.blue} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export type Tone = "blue" | "success" | "warning" | "danger" | "violet" | "teal" | "orange" | "muted";
const TONES: Record<Tone, [string, string]> = {
  blue: [colors.blue, colors.blueSoft], success: [colors.success, colors.successSoft], warning: [colors.warning, colors.warningSoft], danger: [colors.danger, colors.dangerSoft],
  violet: [colors.violet, colors.violetSoft], teal: [colors.teal, colors.tealSoft], orange: [colors.orange, colors.orangeSoft], muted: [colors.muted, colors.border],
};

/** Colored rounded-square icon chip. */
export function IconChip({ name, tone = "blue", size = 44 }: { name: IconName; tone?: Tone; size?: number }) {
  const [fg, bg] = TONES[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: radius.sm, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={name} size={size * 0.5} color={fg} />
    </View>
  );
}

export function Badge({ label, tone = "blue" }: { label: string; tone?: Tone }) {
  const [fg, bg] = TONES[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

/** Row of pill filter chips; the selected one is solid blue. */
export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  // Scrolls sideways on narrow phones instead of clipping the last chip.
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flexGrow: 0 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, on && s.chipOn]}>
            <Text style={[s.chipText, on && { color: colors.white }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm }}>
      <Text style={type.h2}>{children}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={{ color: colors.blue, fontWeight: "700", fontSize: 13 }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Button({ label, onPress, loading, disabled, variant = "primary", icon }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: "primary" | "secondary" | "danger"; icon?: IconName }) {
  const bg = variant === "primary" ? colors.blue : variant === "danger" ? colors.dangerSoft : colors.blueSoft;
  const fg = variant === "primary" ? colors.white : variant === "danger" ? colors.danger : colors.blue;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [s.button, { backgroundColor: bg }, (disabled || loading) && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={{ color: fg, fontWeight: "700", fontSize: 15 }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Skeleton({ height = 16, width = "100%", r = 8 }: { height?: number; width?: number | `${number}%`; r?: number }) {
  const o = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View accessibilityElementsHidden style={{ height, width, borderRadius: r, backgroundColor: "#DDE2EF", opacity: o }} />;
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <View style={{ padding: space.lg, gap: space.md }} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[s.card, { flexDirection: "row", gap: space.md, alignItems: "center" }]}>
          <Skeleton height={44} width={44} r={12} />
          <View style={{ flex: 1, gap: 8 }}><Skeleton height={14} width="70%" /><Skeleton height={12} width="45%" /></View>
        </View>
      ))}
    </View>
  );
}

/** Placeholder shown while a screen's data loads. */
export function Loading() {
  return <SkeletonCards />;
}

export function Empty({ icon = "file-tray-outline", title, text }: { icon?: IconName; title: string; text?: string }) {
  return (
    <View style={s.center}>
      <IconChip name={icon} tone="muted" size={56} />
      <Text style={[type.h2, { marginTop: space.md, textAlign: "center" }]}>{title}</Text>
      {text ? <Text style={[type.small, { textAlign: "center", marginTop: 4 }]}>{text}</Text> : null}
    </View>
  );
}

/** Error / offline state with a retry button. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiError && error.offline;
  const msg = error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
  return (
    <View style={s.center}>
      <IconChip name={offline ? "cloud-offline-outline" : "alert-circle-outline"} tone={offline ? "warning" : "danger"} size={56} />
      <Text style={[type.h2, { marginTop: space.md, textAlign: "center" }]}>{offline ? "You are offline" : "Could not load this"}</Text>
      <Text style={[type.small, { textAlign: "center", marginTop: 4, marginBottom: space.lg }]}>{msg}</Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} icon="refresh" /> : null}
    </View>
  );
}

export function Row({ icon, tone, title, sub, right, onPress }: { icon: IconName; tone?: Tone; title: string; sub?: string; right?: ReactNode; onPress?: () => void }) {
  return (
    <Card onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <IconChip name={icon} tone={tone} />
      <View style={{ flex: 1 }}>
        <Text style={type.body} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={type.small} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null)}
    </Card>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingBottom: space.lg + 4, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, gap: space.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  headerSub: { color: colors.onBlueMuted, fontSize: 13, fontWeight: "500" },
  headerTitle: { color: colors.white, fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.3 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.22)", borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontWeight: "800" },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.lg, borderWidth: 1, borderColor: colors.border, ...shadow },
  chip: { minHeight: 40, justifyContent: "center", paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  button: { minHeight: 50, borderRadius: radius.pill, paddingHorizontal: space.xl, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center", padding: space.xxl },
});
