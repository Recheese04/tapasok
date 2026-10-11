import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Linking, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "../../src/api/client";
import type { ScanSession } from "../../src/api/types";
import { useAuth } from "../../src/auth/AuthContext";
import { Badge, Body, Button, Card, Empty, ErrorState, IconChip, Loading, ScreenHeader, SectionTitle, Spot, Txt } from "../../src/components/ui";
import { fmtTime } from "../../src/format";
import { colors, radius, space } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

type Outcome = { ok: boolean; title: string; text: string; at?: string };

export default function Scan() {
  const router = useRouter();
  const { me } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.scanSessions);
  const [selected, setSelected] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  const locked = useRef(false); // one scan at a time; the camera reports many frames per second

  // The camera runs only while this tab is on screen.
  useFocusEffect(useCallback(() => {
    setFocused(true);
    void refresh();
    return () => setFocused(false);
  }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const sessions = data?.sessions ?? [];
  const open = sessions.filter((s) => s.state === "open" && !s.myStatus);
  const active = sessions.find((s) => s.id === selected) ?? (open.length === 1 ? open[0] : null);

  async function onCode(code: string) {
    if (locked.current || !active) return;
    locked.current = true;
    setBusy(true);
    try {
      // The server checks the code, the chosen session, its window, revocation, eligibility and duplicates.
      const r = await api.scan(code, active.id);
      if (r.ok) setOutcome({ ok: true, title: r.status === "LATE" ? "Checked in · late" : "You're checked in", text: `${active.event.title} · ${active.label}`, at: r.at });
      else setOutcome({ ok: false, title: "Not checked in", text: r.message });
      void refresh();
    } catch (e) {
      setOutcome({ ok: false, title: "Could not check in", text: e instanceof ApiError ? e.message : "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }
  const again = () => { setOutcome(null); locked.current = false; };

  const header = <ScreenHeader eyebrow="Attendance" title="Scan to check in" avatar={me ? { first: me.firstName, last: me.lastName } : undefined} onAvatar={() => router.navigate("/account")} />;
  if (loading && !data) return <View style={{ flex: 1 }}>{header}<Loading /></View>;
  if (error && !data) return <View style={{ flex: 1 }}>{header}<ErrorState error={error} onRetry={reload} /></View>;

  // Full result screen after a scan: unmistakable success or failure.
  if (outcome) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <Body>
          <Card style={{ alignItems: "center", paddingVertical: space.xxxl, gap: space.sm }}>
            <ResultMark ok={outcome.ok} />
            <Txt variant="h1" align="center" style={{ marginTop: space.lg }}>{outcome.title}</Txt>
            <Txt variant="body" align="center" color={colors.textSecondary} style={{ maxWidth: 300 }}>{outcome.text}</Txt>
            {outcome.at ? <Badge label={`Recorded at ${fmtTime(outcome.at)}`} tone="success" icon="time" /> : null}
          </Card>
          <Button label={outcome.ok ? "Done" : "Try again"} icon={outcome.ok ? "checkmark" : "refresh"} onPress={() => { again(); if (outcome.ok) setSelected(null); }} />
          {outcome.ok ? <Button label="View my events" variant="ghost" onPress={() => { again(); router.navigate("/events"); }} /> : null}
        </Body>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {header}
      <Body refreshing={refreshing} onRefresh={refresh}>
        {sessions.length === 0 ? (
          <Card><Empty icon="scan-outline" title="Nothing to scan right now" text="When an officer opens attendance for one of your events, it appears here." /></Card>
        ) : (
          <>
            {/* the QR panel: navy frame around the live camera, with corner guides */}
            <View style={s.panel}>
              <View style={{ alignItems: "center", gap: 2 }}>
                <Txt variant="h2" color={colors.onDark} align="center">{active ? "Point at the QR code" : "Choose a session below"}</Txt>
                <Txt variant="small" color={colors.onDarkMuted} align="center" numberOfLines={1}>{active ? `${active.event.title} · ${active.label}` : "Then scan the code shown by the organizer"}</Txt>
              </View>
              <View style={s.frame}>
                {!active ? (
                  <Placeholder icon="hand-left-outline" text="Pick an open session to start the camera" />
                ) : !permission ? (
                  <Placeholder icon="camera-outline" text="Checking camera access…" />
                ) : permission.granted ? (
                  focused ? <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={busy ? undefined : (r) => void onCode(r.data)} /> : null
                ) : (
                  <Placeholder icon="videocam-off-outline" text={permission.canAskAgain ? "Tapasok needs your camera to read the event's QR code. It is used for nothing else." : "Camera access is turned off for Tapasok. Turn it on in Settings to scan."} />
                )}
                {active && permission?.granted ? <Corners /> : null}
                {active && permission?.granted && !busy ? <ScanLine /> : null}
                {busy ? <View style={s.busy}><Txt variant="bodyStrong" color={colors.onDark}>Checking…</Txt></View> : null}
              </View>
              {active && permission && !permission.granted ? (
                permission.canAskAgain ? <Button label="Allow camera" icon="camera" variant="accent" onPress={() => void requestPermission()} /> : <Button label="Open Settings" icon="settings-outline" variant="onDark" onPress={() => void Linking.openSettings()} />
              ) : null}
            </View>

            <SectionTitle caption="Only sessions you are expected to attend are listed">Sessions</SectionTitle>
            {sessions.map((x) => <SessionRow key={x.id} s={x} on={active?.id === x.id} onPress={() => setSelected(x.id)} />)}
            <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center", paddingHorizontal: space.xs }}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
              <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>Your location is never used. Each check-in is verified on the server.</Txt>
            </View>
          </>
        )}
      </Body>
    </View>
  );
}

function SessionRow({ s: x, on, onPress }: { s: ScanSession; on: boolean; onPress: () => void }) {
  const done = !!x.myStatus;
  const isOpen = x.state === "open";
  const disabled = !isOpen || done;
  return (
    <Pressable disabled={disabled} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on, disabled }} accessibilityLabel={`${x.event.title}, ${x.label}`}>
      <Card style={[{ flexDirection: "row", alignItems: "center", gap: space.md }, on && { borderColor: colors.primary, borderWidth: 2 }, disabled && !done && { opacity: 0.6 }]}>
        <IconChip name={done ? "checkmark-circle" : isOpen ? "scan" : "time-outline"} tone={done ? "success" : isOpen ? "accent" : "neutral"} size={42} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{x.event.title}</Txt>
          <Txt variant="small">{x.label} · {fmtTime(x.opensAt)} – {fmtTime(x.closesAt)}</Txt>
        </View>
        {done ? <Badge label="Checked in" tone="success" dot /> : isOpen ? <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={22} color={on ? colors.primary : colors.borderStrong} /> : <Badge label={x.state === "opens_later" ? "Opens later" : x.state === "not_active" ? "Not active" : "Closed"} tone="neutral" />}
      </Card>
    </Pressable>
  );
}

function ResultMark({ ok }: { ok: boolean }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  useEffect(() => { Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 12 }).start(); }, [scale]);
  return <Animated.View style={{ transform: [{ scale }] }}><Spot icon={ok ? "checkmark-circle" : "close-circle"} tone={ok ? "success" : "danger"} size={128} /></Animated.View>;
}

function Placeholder({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.sm }}>
      <Ionicons name={icon} size={44} color={colors.onDarkMuted} />
      <Txt variant="small" color={colors.onDarkMuted} align="center">{text}</Txt>
    </View>
  );
}

function Corners() {
  const c = { position: "absolute" as const, width: 44, height: 44, borderColor: colors.accent };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[c, { top: 18, left: 18, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 }]} />
      <View style={[c, { top: 18, right: 18, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 }]} />
      <View style={[c, { bottom: 18, left: 18, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 }]} />
      <View style={[c, { bottom: 18, right: 18, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 }]} />
    </View>
  );
}

/** A soft line sweeping the frame while the camera is live, so the member can tell scanning is active. */
function ScanLine() {
  const y = useRef(new Animated.Value(0)).current;
  const [h, setH] = useState(0); // travel distance = the frame's inner height, measured so it fits any phone
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(y, { toValue: 1, duration: 1800, useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: 1800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [y]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { padding: 34 }]}>
      <View style={{ flex: 1 }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
        <Animated.View style={{ height: 2, borderRadius: 1, backgroundColor: colors.accent, opacity: 0.85, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, h - 2)] }) }] }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor: colors.navy900, borderRadius: radius.xl, paddingHorizontal: space.md, paddingVertical: space.xl, gap: space.lg, overflow: "hidden" },
  frame: { aspectRatio: 1, width: "100%", maxWidth: 460, alignSelf: "center", backgroundColor: colors.navy800, borderRadius: radius.lg, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  busy: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(6,18,46,0.6)", alignItems: "center", justifyContent: "center" },
});
