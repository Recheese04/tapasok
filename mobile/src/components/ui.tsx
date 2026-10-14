// Tapasok design-system primitives. Every screen is composed from these; screens should not invent their own colours,
// type sizes, radii or shadows. Tokens live in ../theme.
import { useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
  type ScrollViewProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../api/client";
import { initials } from "../format";
import { colors, elevation, fonts, gradients, MIN_TOUCH, radius, space, TAB_BAR_SPACE, tones, typography, type Tone, type TypeVariant } from "../theme";

export type { Tone } from "../theme";
export type IconName = keyof typeof Ionicons.glyphMap;

// ---------------------------------------------------------------- text
export function Txt({ variant = "body", color, align, style, children, ...rest }: TextProps & { variant?: TypeVariant; color?: string; align?: TextStyle["textAlign"] }) {
  return <Text {...rest} style={[typography[variant], color ? { color } : null, align ? { textAlign: align } : null, style]}>{children}</Text>;
}

// ---------------------------------------------------------------- icon chip, badge, avatar
export function IconChip({ name, tone = "primary", size = 44, solid }: { name: IconName; tone?: Tone; size?: number; solid?: boolean }) {
  const t = tones[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: solid ? t.solid : t.soft, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={name} size={Math.round(size * 0.5)} color={solid ? colors.onDark : t.solid} />
    </View>
  );
}

export function Badge({ label, tone = "primary", dot, icon }: { label: string; tone?: Tone; dot?: boolean; icon?: IconName }) {
  const t = tones[tone];
  return (
    <View style={[s.badge, { backgroundColor: t.soft }]}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.solid }} /> : null}
      {icon ? <Ionicons name={icon} size={12} color={t.ink} /> : null}
      <Text style={[s.badgeText, { color: t.ink }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Avatar({ first, last, size = 44, onDark }: { first: string; last: string; size?: number; onDark?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: onDark ? colors.onDarkFaint : colors.primarySoft, borderWidth: onDark ? 1.5 : 0, borderColor: "rgba(255,255,255,0.45)" }}>
      <Text style={{ fontFamily: fonts.extrabold, fontSize: size * 0.36, color: onDark ? colors.onDark : colors.primaryInk }}>{initials(first, last)}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- buttons
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "onDark";
const BUTTON: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.onDark },
  secondary: { bg: colors.primarySoft, fg: colors.primaryInk },
  ghost: { bg: "transparent", fg: colors.primary, border: colors.borderStrong },
  danger: { bg: colors.dangerSoft, fg: colors.dangerInk },
  accent: { bg: colors.accent, fg: colors.navy900 },
  onDark: { bg: colors.onDark, fg: colors.navy900 },
};
export function Button({ label, onPress, loading, disabled, variant = "primary", icon, size = "md", accessibilityLabel }: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: ButtonVariant; icon?: IconName; size?: "sm" | "md" | "lg"; accessibilityLabel?: string;
}) {
  const v = BUTTON[variant];
  const h = size === "lg" ? 54 : size === "sm" ? MIN_TOUCH : 50;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [s.button, { minHeight: h, backgroundColor: v.bg, borderColor: v.border ?? "transparent", borderWidth: v.border ? 1.5 : 0, paddingHorizontal: size === "sm" ? space.lg : space.xl }, off && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={size === "sm" ? 16 : 18} color={v.fg} /> : null}
          <Text style={[typography.button, { color: v.fg, fontSize: size === "sm" ? 14 : 15 }]} numberOfLines={1}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Round icon-only button with a 44pt hit area. */
export function IconButton({ name, onPress, label, onDark, badge }: { name: IconName; onPress: () => void; label: string; onDark?: boolean; badge?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [s.iconBtn, { backgroundColor: onDark ? colors.onDarkFaint : colors.surface }, !onDark && { borderWidth: 1, borderColor: colors.border }, pressed && { opacity: 0.75 }]}>
      <Ionicons name={name} size={20} color={onDark ? colors.onDark : colors.text} />
      {badge ? <View style={s.dotBadge}><Text style={s.dotBadgeText}>{badge > 9 ? "9+" : badge}</Text></View> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------- cards and lists
type CardVariant = "default" | "tinted" | "dark" | "outline";
export function Card({ children, style, onPress, accessibilityLabel, variant = "default", tone = "primary", padded = true }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string; variant?: CardVariant; tone?: Tone; padded?: boolean;
}) {
  const base: StyleProp<ViewStyle> = [
    s.card,
    !padded && { padding: 0 },
    variant === "tinted" && { backgroundColor: tones[tone].soft, borderColor: "transparent", shadowOpacity: 0, elevation: 0 },
    variant === "outline" && { backgroundColor: "transparent", shadowOpacity: 0, elevation: 0, borderColor: colors.borderStrong, borderStyle: "dashed" },
    variant === "dark" && { borderColor: "transparent", overflow: "hidden" },
    style,
  ];
  const inner = variant === "dark" ? (
    <>
      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Rings />
      {children}
    </>
  ) : children;
  if (onPress) {
    return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [base, pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] }]}>{inner}</Pressable>;
  }
  return <View style={base}>{inner}</View>;
}

/** Faint concentric rings used on navy surfaces: the one decorative motif, echoing the reference's layered header. */
export function Rings({ size = 220, right = -70, top = -90 }: { size?: number; right?: number; top?: number }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", right, top }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: size * 0.66, height: size * 0.66, borderRadius: size, backgroundColor: "rgba(255,255,255,0.06)" }} />
      </View>
    </View>
  );
}

/** One row inside a list. Put several in a <ListGroup>, or use <Row> for a single row card. */
export function ListItem({ icon, tone, title, subtitle, meta, right, onPress, chevron = !!onPress, accessibilityLabel }: {
  icon?: IconName; tone?: Tone; title: string; subtitle?: string; meta?: string; right?: ReactNode; onPress?: () => void; chevron?: boolean; accessibilityLabel?: string;
}) {
  accessibilityLabel ??= [title, subtitle].filter(Boolean).join(", ");
  const body = (
    <>
      {icon ? <IconChip name={icon} tone={tone} size={40} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong" numberOfLines={2}>{title}</Txt>
        {subtitle ? <Txt variant="small" numberOfLines={2}>{subtitle}</Txt> : null}
        {meta ? <Txt variant="small" color={colors.textMuted} numberOfLines={1}>{meta}</Txt> : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [s.listItem, pressed && { backgroundColor: colors.surfaceAlt }]}>{body}</Pressable>
  ) : <View style={s.listItem} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>{body}</View>;
}

export function ListGroup({ children }: { children: ReactNode }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <Card padded={false} style={{ overflow: "hidden" }}>
      {items.map((c, i) => (
        <View key={i}>
          {i ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginLeft: space.lg + 40 + space.md }} /> : null}
          {c}
        </View>
      ))}
    </Card>
  );
}

/** A single list row in its own card. */
export function Row(props: Parameters<typeof ListItem>[0]) {
  return <Card padded={false} style={{ overflow: "hidden" }}><ListItem {...props} /></Card>;
}

export function SectionTitle({ children, action, onAction, caption }: { children: string; action?: string; onAction?: () => void; caption?: string }) {
  return (
    <View style={s.section}>
      <View style={{ flex: 1 }}>
        <Txt variant="h3">{children}</Txt>
        {caption ? <Txt variant="small" color={colors.textMuted}>{caption}</Txt> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button" accessibilityLabel={`${action}: ${children}`} style={{ minHeight: MIN_TOUCH, justifyContent: "center" }}>
          <Txt variant="smallStrong" color={colors.primary}>{action}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Pill filters. Scrolls sideways on narrow phones instead of clipping. `onDark` for use inside the navy header. */
export function Chips<T extends string>({ options, value, onChange, onDark }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; onDark?: boolean }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }} style={{ flexGrow: 0 }}>
      {options.map((o) => {
        const on = o.value === value;
        const bg = on ? (onDark ? colors.onDark : colors.navy900) : onDark ? colors.onDarkFaint : colors.surface;
        const fg = on ? (onDark ? colors.navy900 : colors.onDark) : onDark ? colors.onDark : colors.textSecondary;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.count ? `${o.label}, ${o.count}` : o.label}
            style={[s.chip, { backgroundColor: bg, borderColor: on ? bg : onDark ? "rgba(255,255,255,0.22)" : colors.border }]}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: fg }}>{o.label}</Text>
            {o.count ? <View style={[s.chipCount, { backgroundColor: on ? colors.accent : onDark ? "rgba(255,255,255,0.22)" : colors.primarySoft }]}><Text style={{ fontFamily: fonts.extrabold, fontSize: 11, color: on ? colors.navy900 : onDark ? colors.onDark : colors.primaryInk }}>{o.count}</Text></View> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------- page frame
/**
 * Navy page header. `title` is the page name; `eyebrow` gives context above it (greeting, organization). Faint rings are
 * the only decoration. `children` sits under the title (filters, organization chip, search).
 */
export function ScreenHeader({ title, eyebrow, subtitle, avatar, onAvatar, back, children, right, lead }: {
  title: string; eyebrow?: string; subtitle?: string; avatar?: { first: string; last: string }; onAvatar?: () => void; back?: () => void; children?: ReactNode; right?: ReactNode;
  lead?: ReactNode; // shown before the title, e.g. a large profile picture
}) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={gradients.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: insets.top + space.md }]}>
      <Rings size={260} right={-90} top={-120} />
      <View style={s.headerRow}>
        {back ? <IconButton name="chevron-back" label="Go back" onDark onPress={back} /> : null}
        {lead}
        <View style={{ flex: 1 }}>
          {eyebrow ? <Txt variant="small" color={colors.onDarkMuted} numberOfLines={1}>{eyebrow}</Txt> : null}
          <Txt variant={back ? "h2" : "h1"} color={colors.onDark} numberOfLines={1}>{title}</Txt>
          {subtitle ? <Txt variant="small" color={colors.onDarkMuted} numberOfLines={1}>{subtitle}</Txt> : null}
        </View>
        {right}
        {avatar ? (
          <Pressable onPress={onAvatar} accessibilityRole="button" accessibilityLabel="Open account" hitSlop={4}><Avatar first={avatar.first} last={avatar.last} onDark /></Pressable>
        ) : null}
      </View>
      {children ? <View style={{ marginTop: space.md }}>{children}</View> : null}
    </LinearGradient>
  );
}

/** Scrolling page body. Leaves room for the floating tab bar (`tabs`) and supports pull-to-refresh. */
export function Body({ children, refreshing, onRefresh, tabs = true, ...rest }: ScrollViewProps & { refreshing?: boolean; onRefresh?: () => void; tabs?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      {...rest} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: (tabs ? TAB_BAR_SPACE : space.xxl) + insets.bottom }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

// ---------------------------------------------------------------- loading, empty, error
export function Skeleton({ height = 16, width = "100%", r = 8 }: { height?: number; width?: number | `${number}%`; r?: number }) {
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.5, duration: 750, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View accessibilityElementsHidden style={{ height, width, borderRadius: r, backgroundColor: "#E1E6F1", opacity: o }} />;
}

export function SkeletonCards({ count = 3, hero }: { count?: number; hero?: boolean }) {
  return (
    <View style={{ padding: space.lg, gap: space.md }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {hero ? <Skeleton height={150} r={radius.lg} /> : null}
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[s.card, { flexDirection: "row", gap: space.md, alignItems: "center" }]}>
          <Skeleton height={44} width={44} r={14} />
          <View style={{ flex: 1, gap: 8 }}><Skeleton height={14} width="72%" /><Skeleton height={12} width="46%" /></View>
        </View>
      ))}
    </View>
  );
}

/** Placeholder shown while a screen's data loads. */
export function Loading({ hero }: { hero?: boolean }) {
  return <SkeletonCards hero={hero} />;
}

/** Layered-circle spot illustration around an icon, for empty / error / success states. */
export function Spot({ icon, tone = "primary", size = 96 }: { icon: IconName; tone?: Tone; size?: number }) {
  const t = tones[tone];
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: t.soft, opacity: 0.6 }} />
      <View style={{ position: "absolute", width: size * 0.72, height: size * 0.72, borderRadius: size, backgroundColor: t.soft }} />
      <View style={{ position: "absolute", top: size * 0.08, right: size * 0.1, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
      <View style={{ position: "absolute", bottom: size * 0.14, left: size * 0.06, width: 6, height: 6, borderRadius: 3, backgroundColor: t.solid, opacity: 0.5 }} />
      <Ionicons name={icon} size={size * 0.36} color={t.solid} />
    </View>
  );
}

export function Empty({ icon = "file-tray-outline", title, text, action, onAction, tone = "primary" }: { icon?: IconName; title: string; text?: string; action?: string; onAction?: () => void; tone?: Tone }) {
  return (
    <View style={s.center}>
      <Spot icon={icon} tone={tone} />
      <Txt variant="h3" align="center" style={{ marginTop: space.md }}>{title}</Txt>
      {text ? <Txt variant="small" align="center" style={{ marginTop: 4, maxWidth: 300 }}>{text}</Txt> : null}
      {action && onAction ? <View style={{ marginTop: space.lg }}><Button label={action} variant="secondary" size="sm" onPress={onAction} /></View> : null}
    </View>
  );
}

/** Error / offline state with a retry button. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiError && error.offline;
  const msg = error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
  return (
    <View style={s.center}>
      <Spot icon={offline ? "cloud-offline-outline" : "alert-circle-outline"} tone={offline ? "warning" : "danger"} />
      <Txt variant="h3" align="center" style={{ marginTop: space.md }}>{offline ? "You are offline" : "Could not load this"}</Txt>
      <Txt variant="small" align="center" style={{ marginTop: 4, marginBottom: space.lg, maxWidth: 300 }}>{msg}</Txt>
      {onRetry ? <Button label="Try again" onPress={onRetry} icon="refresh" size="sm" /> : null}
    </View>
  );
}

// ---------------------------------------------------------------- data display
export function ProgressBar({ value, tone = "success", height = 8, onDark }: { value: number; tone?: Tone; height?: number; onDark?: boolean }) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: onDark ? "rgba(255,255,255,0.18)" : colors.border, overflow: "hidden" }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}>
      <View style={{ height, width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: tones[tone].solid, borderRadius: height }} />
    </View>
  );
}

/** Stacked bar with legend (e.g. collected / awaiting / outstanding). Values are relative; labels carry the real figures. */
export function SegmentBar({ segments, onDark }: { segments: { label: string; value: number; display: string; tone: Tone }[]; onDark?: boolean }) {
  const total = segments.reduce((a, b) => a + Math.max(0, b.value), 0);
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", height: 10, borderRadius: 10, overflow: "hidden", backgroundColor: onDark ? "rgba(255,255,255,0.18)" : colors.border, gap: 2 }}>
        {total > 0 ? segments.filter((x) => x.value > 0).map((x) => <View key={x.label} style={{ flex: x.value, backgroundColor: tones[x.tone].solid }} />) : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space.sm, columnGap: space.lg }}>
        {segments.map((x) => (
          <View key={x.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tones[x.tone].solid }} />
            <Txt variant="small" color={onDark ? colors.onDarkMuted : colors.textSecondary}>{x.label}</Txt>
            <Txt variant="smallStrong" color={onDark ? colors.onDark : colors.text} style={{ fontVariant: ["tabular-nums"] }}>{x.display}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Small column chart from real series data. The latest bar is highlighted in the accent colour. */
export function BarChart({ data, format = (v) => String(v), height = 110, accessibilityLabel }: { data: { label: string; value: number }[]; format?: (v: number) => string; height?: number; accessibilityLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const summary = data.map((d) => `${d.label} ${format(d.value)}`).join(", ");
  return (
    <View accessible accessibilityLabel={`${accessibilityLabel}: ${summary}`} style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm, height: height + 36 }}>
      {data.map((d, i) => {
        const last = i === data.length - 1;
        const h = Math.max(4, Math.round((d.value / max) * height));
        return (
          <View key={d.label + i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
            <Txt variant="caption" color={last ? colors.text : colors.textMuted} style={{ letterSpacing: 0, textTransform: "none" }} numberOfLines={1} adjustsFontSizeToFit>{d.value ? format(d.value) : ""}</Txt>
            <View style={{ width: "100%", maxWidth: 34, height: h, borderRadius: 8, backgroundColor: last ? colors.accent : d.value ? colors.primary : colors.border, opacity: last || !d.value ? 1 : 0.85 }} />
            <Txt variant="caption" style={{ letterSpacing: 0.3 }}>{d.label}</Txt>
          </View>
        );
      })}
    </View>
  );
}

export function StatTile({ icon, tone = "primary", label, value, sub, onPress }: { icon: IconName; tone?: Tone; label: string; value: string; sub?: string; onPress?: () => void }) {
  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <IconChip name={icon} tone={tone} size={36} />
        {onPress ? <Ionicons name="arrow-forward" size={16} color={colors.textMuted} /> : null}
      </View>
      <Txt variant="number" numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: space.md }}>{value}</Txt>
      <Txt variant="small" numberOfLines={2}>{label}</Txt>
      {sub ? <Txt variant="caption" style={{ marginTop: 2, textTransform: "none", letterSpacing: 0 }} numberOfLines={1}>{sub}</Txt> : null}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={({ pressed }) => [s.tile, pressed && { opacity: 0.88 }]}>{body}</Pressable>
  ) : <View style={s.tile} accessible accessibilityLabel={`${label}: ${value}`}>{body}</View>;
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>{children}</View>;
}

export function KeyValue({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md, minHeight: 28 }}>
      <Txt variant={strong ? "bodyStrong" : "small"}>{label}</Txt>
      <Txt variant={strong ? "h3" : "bodyStrong"} color={color} style={{ fontVariant: ["tabular-nums"] }}>{value}</Txt>
    </View>
  );
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** Calendar tile (month over day) used on every event card. */
export function DateBlock({ iso, tone = "primary", size = 54 }: { iso: string; tone?: Tone; size?: number }) {
  const d = new Date(iso);
  const t = tones[tone];
  return (
    <View style={{ width: size, height: size + 4, borderRadius: radius.sm, backgroundColor: t.soft, alignItems: "center", justifyContent: "center", overflow: "hidden" }} accessibilityElementsHidden>
      <Text style={{ fontFamily: fonts.extrabold, fontSize: 10, letterSpacing: 1, color: t.solid }}>{MONTHS[d.getMonth()]}</Text>
      <Text style={{ fontFamily: fonts.extrabold, fontSize: size * 0.42, lineHeight: size * 0.5, color: t.ink }}>{d.getDate()}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong }} />;
}

const s = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingBottom: space.xl, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, overflow: "hidden" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border, ...elevation.sm },
  listItem: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.md, minHeight: 32 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, maxWidth: "100%" },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 },
  button: { borderRadius: radius.pill, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: "center", justifyContent: "center" },
  dotBadge: { position: "absolute", top: 4, right: 3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: colors.navy900 },
  dotBadgeText: { fontFamily: fonts.extrabold, fontSize: 10, color: colors.navy900 },
  chip: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1 },
  chipCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  tile: { flexBasis: "46%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border, ...elevation.sm },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: space.xxxl, paddingHorizontal: space.xl },
});
