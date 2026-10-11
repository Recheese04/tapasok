// Composite design-system pieces: sheets, form fields, toast and confirmation dialogs, the organization switcher.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrg } from "../org/OrgContext";
import { primaryRole } from "../roles";
import { roleLabel } from "../format";
import { colors, elevation, fonts, MIN_TOUCH, radius, space, tones, type Tone } from "../theme";
import { Badge, Button, IconChip, Spot, Txt, type IconName } from "./ui";

export { BarChart, ProgressBar, SegmentBar, Skeleton, SkeletonCards, StatTile, TileGrid } from "./ui";

// ---------------------------------------------------------------- bottom sheet
export function Sheet({ visible, onClose, title, subtitle, children }: { visible: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button"><View style={s.scrim} /></Pressable>
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]} accessibilityViewIsModal>
          <View style={s.handle} />
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.lg }}>
            <View style={{ flex: 1 }}>
              <Txt variant="h1">{title}</Txt>
              {subtitle ? <Txt variant="small" style={{ marginTop: 2 }}>{subtitle}</Txt> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close" accessibilityRole="button" style={s.close}><Ionicons name="close" size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.lg, paddingBottom: space.sm }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------- form fields
export function Field({ label, error, hint, multiline, icon, ...rest }: TextInputProps & { label: string; error?: string | null; hint?: string; icon?: IconName }) {
  const [focus, setFocus] = useState(false);
  return (
    <View>
      <Txt variant="label" style={{ marginBottom: 6 }}>{label}</Txt>
      <View style={[s.inputWrap, multiline && { alignItems: "flex-start" }, focus && s.inputFocus, !!error && { borderColor: colors.danger }]}>
        {icon ? <Ionicons name={icon} size={18} color={focus ? colors.primary : colors.textMuted} style={multiline ? { marginTop: 14 } : null} /> : null}
        <TextInput
          placeholderTextColor={colors.textMuted} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} accessibilityLabel={label}
          onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }} onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
          style={[s.input, multiline && { minHeight: 120, paddingTop: 13 }]} {...rest}
        />
      </View>
      {error ? <Txt variant="small" color={colors.dangerInk} style={{ marginTop: 6 }}>{error}</Txt> : hint ? <Txt variant="small" color={colors.textMuted} style={{ marginTop: 6 }}>{hint}</Txt> : null}
    </View>
  );
}

const fmt = (d: Date) => `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

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
      <Txt variant="label" style={{ marginBottom: 6 }}>{label}</Txt>
      {Platform.OS === "ios" ? (
        <View style={[s.inputWrap, { justifyContent: "flex-start" }]}><DateTimePicker value={value} mode="datetime" display="compact" onChange={(_e, d) => d && onChange(d)} /></View>
      ) : (
        <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${label}: ${fmt(value)}. Change`} style={s.inputWrap}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Txt variant="bodyStrong" style={{ flex: 1 }}>{fmt(value)}</Txt>
          <Txt variant="smallStrong" color={colors.primary}>Change</Txt>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- toast
type ToastApi = { show: (message: string, kind?: "success" | "error") => void };
const ToastCtx = createContext<ToastApi>({ show: () => undefined });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [t, setT] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const y = useRef(new Animated.Value(-100)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((message: string, kind: "success" | "error" = "success") => {
    setT({ message, kind });
    y.setValue(-100);
    Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 5 }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => Animated.timing(y, { toValue: -140, duration: 220, useNativeDriver: true }).start(() => setT(null)), 3000);
  }, [y]);
  const ok = t?.kind === "success";
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {t ? (
        <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" accessibilityRole="alert" style={[s.toast, { top: insets.top + space.sm, transform: [{ translateY: y }] }]}>
          <View style={[s.toastIcon, { backgroundColor: ok ? colors.success : colors.danger }]}><Ionicons name={ok ? "checkmark" : "alert"} size={16} color={colors.onDark} /></View>
          <Txt variant="bodyStrong" color={colors.onDark} style={{ flex: 1 }}>{t.message}</Txt>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- confirmation dialog
type ConfirmOptions = { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; tone?: "primary" | "danger"; icon?: IconName };
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);
/** `const confirm = useConfirm(); if (await confirm({...})) …` — one consistent dialog on every platform. */
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => { resolver.current = resolve; setOpts(o); }), []);
  const done = (v: boolean) => { resolver.current?.(v); resolver.current = null; setOpts(null); };
  const danger = opts?.tone === "danger";
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal visible={!!opts} transparent animationType="fade" onRequestClose={() => done(false)} statusBarTranslucent>
        <View style={[s.scrim, { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl }]}>
          <View style={s.dialog} accessibilityViewIsModal accessibilityRole="alert">
            <Spot icon={opts?.icon ?? (danger ? "alert-circle-outline" : "help-circle-outline")} tone={danger ? "danger" : "primary"} size={76} />
            <Txt variant="h2" align="center" style={{ marginTop: space.md }}>{opts?.title}</Txt>
            {opts?.message ? <Txt variant="small" align="center" style={{ marginTop: space.xs }}>{opts.message}</Txt> : null}
            <View style={{ alignSelf: "stretch", gap: space.sm, marginTop: space.xl }}>
              <Button label={opts?.confirmLabel ?? "Confirm"} variant={danger ? "danger" : "primary"} onPress={() => done(true)} />
              <Button label={opts?.cancelLabel ?? "Cancel"} variant="ghost" onPress={() => done(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

// ---------------------------------------------------------------- organization switcher
/** The active organization and the person's position in it. With several organizations it opens a list to switch. */
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
        style={({ pressed }) => [s.orgChip, pressed && { opacity: 0.85 }]}
      >
        <View style={s.orgMark}><Text style={s.orgMarkText}>{(org.acronym ?? org.name).slice(0, 2).toUpperCase()}</Text></View>
        <View style={{ flexShrink: 1 }}>
          <Text style={s.orgName} numberOfLines={1}>{org.acronym ?? org.name}</Text>
          <Text style={s.orgRole} numberOfLines={1}>{label}</Text>
        </View>
        {many ? <View style={s.orgSwap}><Ionicons name="swap-horizontal" size={14} color={colors.navy900} /></View> : null}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Your organizations" subtitle="Tools follow your position in the organization you pick. Your own events, fees and attendance stay the same.">
        <View style={{ gap: space.sm }}>
          {orgs.map((o) => {
            const on = o.id === org.id;
            const officer = primaryRole(o.roles) !== "MEMBER";
            return (
              <Pressable key={o.id} onPress={() => { setActiveOrgId(o.id); setOpen(false); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${o.name}${on ? ", selected" : ""}`}
                style={[s.orgRow, on && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
                <IconChip name={officer ? "shield-checkmark" : "people"} tone={officer ? "violet" : "primary"} size={44} solid={on} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt variant="h3" numberOfLines={1}>{o.name}</Txt>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                    {o.roles.map((x, i) => <Badge key={i} label={roleLabel(x.role, x.title)} tone={x.role === "MEMBER" ? "neutral" : "violet"} />)}
                  </View>
                </View>
                <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={24} color={on ? colors.primary : colors.borderStrong} />
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

/** Banner for important inline notices (pending items, read-only access, web-only features). */
export function Notice({ icon, tone = "info", title, text, onPress }: { icon: IconName; tone?: Tone; title: string; text?: string; onPress?: () => void }) {
  const t = tones[tone];
  const body = (
    <>
      <IconChip name={icon} tone={tone} size={40} solid />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" color={t.ink}>{title}</Txt>
        {text ? <Txt variant="small" color={t.ink} style={{ opacity: 0.85 }}>{text}</Txt> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={t.ink} /> : null}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${text ?? ""}`} style={({ pressed }) => [s.notice, { backgroundColor: t.soft }, pressed && { opacity: 0.9 }]}>{body}</Pressable>
  ) : <View style={[s.notice, { backgroundColor: t.soft }]}>{body}</View>;
}

const s = StyleSheet.create({
  scrim: { backgroundColor: "rgba(6,18,46,0.55)", flex: 1 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.xl, paddingTop: space.sm, maxHeight: "90%", ...elevation.lg },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: space.lg },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: "center", justifyContent: "center", borderRadius: MIN_TOUCH / 2, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  inputWrap: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: space.md },
  inputFocus: { borderColor: colors.primary, backgroundColor: colors.surface },
  input: { flex: 1, minHeight: 48, fontFamily: fonts.medium, fontSize: 15, color: colors.text, paddingVertical: 0 },
  toast: { position: "absolute", left: space.lg, right: space.lg, flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 14, paddingHorizontal: space.lg, borderRadius: radius.lg, backgroundColor: colors.navy900, ...elevation.lg, zIndex: 50 },
  toastIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  dialog: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xl, alignItems: "center", ...elevation.lg },
  orgChip: { flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "flex-start", maxWidth: "100%", minHeight: MIN_TOUCH, paddingVertical: 5, paddingLeft: 5, paddingRight: space.md, borderRadius: radius.pill, backgroundColor: colors.onDarkFaint, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  orgMark: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  orgMarkText: { fontFamily: fonts.extrabold, fontSize: 12, color: colors.navy900 },
  orgName: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.onDark },
  orgRole: { fontFamily: fonts.semibold, fontSize: 11, color: colors.onDarkMuted },
  orgSwap: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.onDark, alignItems: "center", justifyContent: "center", marginLeft: 4 },
  orgRow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, minHeight: 72 },
  notice: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg },
});
