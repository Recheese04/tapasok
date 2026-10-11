import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrg } from "../org/OrgContext";
import { primaryRole } from "../roles";
import { roleLabel } from "../format";
import { colors, MIN_TOUCH, radius, shadow, space, type } from "../theme";
import { Badge, Button, IconChip, type Tone } from "./ui";
export { Skeleton, SkeletonCards } from "./ui";

type IconName = keyof typeof Ionicons.glyphMap;

// ---------------------------------------------------------------- statistic tile
export function StatTile({ icon, tone = "blue", label, value, sub, onPress }: { icon: IconName; tone?: Tone; label: string; value: string; sub?: string; onPress?: () => void }) {
  const body = (
    <>
      <IconChip name={icon} tone={tone} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={type.number} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Text style={type.small} numberOfLines={2}>{label}</Text>
        {sub ? <Text style={[type.caption, { marginTop: 1 }]} numberOfLines={2}>{sub}</Text> : null}
      </View>
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={({ pressed }) => [s.tile, pressed && { opacity: 0.85 }]}>{body}</Pressable>
  ) : (
    <View style={s.tile} accessible accessibilityLabel={`${label}: ${value}`}>{body}</View>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>{children}</View>;
}

export function ProgressBar({ value, tone = "success" }: { value: number; tone?: Tone }) {
  const color = tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : tone === "blue" ? colors.blue : colors.success;
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}>
      <View style={{ height: 8, width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

// ---------------------------------------------------------------- bottom sheet and form field
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button"><View style={{ flex: 1, backgroundColor: "rgba(10,18,50,0.45)" }} /></Pressable>
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.handle} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md }}>
            <Text style={type.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" accessibilityRole="button" style={s.close}><Ionicons name="close" size={20} color={colors.textSoft} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md, paddingBottom: space.sm }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Field({ label, error, multiline, ...rest }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} accessibilityLabel={label}
        style={[s.input, multiline && { minHeight: 110, paddingTop: 12 }, !!error && { borderColor: colors.danger }]} {...rest}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------- date and time
const fmt = (d: Date) => `${d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

/** Native date + time picker: two steps on Android, one compact control on iOS. */
export function DateTimeField({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  const open = () => {
    if (Platform.OS !== "android") return;
    DateTimePickerAndroid.open({
      value, mode: "date",
      onChange: (_e, date) => {
        if (!date) return;
        DateTimePickerAndroid.open({ value: date, mode: "time", onChange: (_e2, time) => { if (time) onChange(time); } });
      },
    });
  };
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      {Platform.OS === "android" || Platform.OS === "web" ? (
        <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${label}: ${fmt(value)}`} style={[s.input, { justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 8 }]}>
          <Ionicons name="calendar-outline" size={18} color={colors.blue} />
          <Text style={[type.body, { flex: 1 }]}>{fmt(value)}</Text>
        </Pressable>
      ) : (
        <View style={{ alignItems: "flex-start" }}><DateTimePicker value={value} mode="datetime" display="compact" onChange={(_e, d) => d && onChange(d)} /></View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- toast feedback
type ToastApi = { show: (message: string, kind?: "success" | "error") => void };
const ToastCtx = createContext<ToastApi>({ show: () => undefined });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [t, setT] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const y = useRef(new Animated.Value(-80)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((message: string, kind: "success" | "error" = "success") => {
    setT({ message, kind });
    Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => Animated.timing(y, { toValue: -120, duration: 220, useNativeDriver: true }).start(() => setT(null)), 2800);
  }, [y]);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {t ? (
        <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[s.toast, { top: insets.top + 8, transform: [{ translateY: y }], backgroundColor: t.kind === "success" ? colors.navy : colors.danger }]}>
          <Ionicons name={t.kind === "success" ? "checkmark-circle" : "alert-circle"} size={20} color={colors.white} />
          <Text style={{ color: colors.white, fontWeight: "600", flex: 1 }}>{t.message}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- organization switcher
/** Shows the active organization and the person's position in it. With several organizations it opens a list to switch. */
export function OrgChip() {
  const { org, orgs, setActiveOrgId } = useOrg();
  const [open, setOpen] = useState(false);
  if (!org) return null;
  const many = orgs.length > 1;
  const role = primaryRole(org.roles);
  const label = roleLabel(role, org.roles.find((r) => r.role === role)?.title);
  return (
    <>
      <Pressable
        disabled={!many} onPress={() => setOpen(true)} accessibilityRole={many ? "button" : "text"} accessibilityLabel={`Organization ${org.name}, ${label}${many ? ". Tap to switch" : ""}`}
        style={s.chip}
      >
        <View style={s.chipDot}><Ionicons name="people" size={14} color={colors.blue} /></View>
        <View style={{ flexShrink: 1 }}>
          <Text style={s.chipName} numberOfLines={1}>{org.acronym ?? org.name}</Text>
          <Text style={s.chipRole} numberOfLines={1}>{label}</Text>
        </View>
        {many ? <Ionicons name="chevron-down" size={16} color={colors.white} /> : null}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Switch organization">
        <Text style={type.small}>Your tools change with your position in each organization. Your personal events, fees and attendance stay the same.</Text>
        {orgs.map((o) => {
          const r = primaryRole(o.roles);
          const on = o.id === org.id;
          return (
            <Pressable key={o.id} onPress={() => { setActiveOrgId(o.id); setOpen(false); }} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.orgRow, on && { borderColor: colors.blue, backgroundColor: colors.blueSoft }]}>
              <IconChip name="people" tone="violet" size={40} />
              <View style={{ flex: 1 }}>
                <Text style={type.h2} numberOfLines={1}>{o.name}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  {o.roles.map((x, i) => <Badge key={i} label={roleLabel(x.role, x.title)} tone={x.role === "MEMBER" ? "muted" : "violet"} />)}
                </View>
              </View>
              {on ? <Ionicons name="checkmark-circle" size={22} color={colors.blue} /> : r === "MEMBER" ? null : <Ionicons name="shield-checkmark-outline" size={20} color={colors.muted} />}
            </Pressable>
          );
        })}
        <Button label="Done" variant="secondary" onPress={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.lg, borderWidth: 1, borderColor: colors.border, ...shadow },
  tile: { flexBasis: "47%", flexGrow: 1, minWidth: 150, flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border, ...shadow },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space.lg, paddingTop: 10, maxHeight: "88%" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.md },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: colors.bg },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
  input: { minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: space.md, fontSize: 15, color: colors.text },
  toast: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.md, ...shadow, zIndex: 50 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", maxWidth: "100%", minHeight: 40, paddingVertical: 4, paddingLeft: 6, paddingRight: 12, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
  chipDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  chipName: { color: colors.white, fontWeight: "800", fontSize: 14 },
  chipRole: { color: colors.onBlueMuted, fontSize: 11, fontWeight: "600" },
  orgRow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, minHeight: 64 },
});
