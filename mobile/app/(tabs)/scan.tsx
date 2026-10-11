import { useCallback, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { Badge, Body, Button, Card, Empty, ErrorState, IconChip, Loading, ScreenHeader, SectionTitle } from "../../src/components/ui";
import { fmtTime } from "../../src/format";
import { colors, radius, space, type } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

type Outcome = { ok: boolean; title: string; text: string };

export default function Scan() {
  const router = useRouter();
  const { me } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.scanSessions);
  const [selected, setSelected] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  const locked = useRef(false); // one scan at a time; the camera fires many frames per second

  // The camera runs only while this tab is on screen.
  useFocusEffect(useCallback(() => {
    setFocused(true);
    void refresh();
    return () => setFocused(false);
  }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const sessions = data?.sessions ?? [];
  const open = sessions.filter((s) => s.state === "open");
  const active = sessions.find((s) => s.id === selected) ?? (open.length === 1 ? open[0] : null);

  async function onCode(code: string) {
    if (locked.current || !active) return;
    locked.current = true;
    setBusy(true);
    try {
      // The server checks the code, the chosen session, its time window, revocation, eligibility and duplicates.
      const r = await api.scan(code, active.id);
      if (r.ok) setOutcome({ ok: true, title: r.status === "LATE" ? "Checked in (late)" : "You are checked in", text: `${active.event.title} · ${active.label}` });
      else setOutcome({ ok: false, title: "Not checked in", text: r.message });
      void refresh();
    } catch (e) {
      setOutcome({ ok: false, title: "Could not check in", text: e instanceof ApiError ? e.message : "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }
  const again = () => { setOutcome(null); locked.current = false; };

  const header = (
    <ScreenHeader title="Scan" subtitle="Attendance check-in" avatar={me ? { first: me.firstName, last: me.lastName } : undefined} onAvatar={() => router.navigate("/account")} />
  );
  if (loading && !data) return <View style={{ flex: 1 }}>{header}<Loading /></View>;
  if (error && !data) return <View style={{ flex: 1 }}>{header}<ErrorState error={error} onRetry={reload} /></View>;

  return (
    <View style={{ flex: 1 }}>
      {header}
      <Body refreshing={refreshing} onRefresh={refresh}>
        {sessions.length === 0 ? (
          <Card><Empty icon="qr-code-outline" title="Nothing to scan right now" text="When an officer opens attendance for one of your events, it will appear here." /></Card>
        ) : (
          <>
            <SectionTitle>Choose the session</SectionTitle>
            {sessions.map((s) => {
              const on = active?.id === s.id;
              const isOpen = s.state === "open";
              return (
                <Pressable
                  key={s.id}
                  disabled={!isOpen || !!s.myStatus}
                  onPress={() => { setSelected(s.id); again(); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: !isOpen || !!s.myStatus }}
                >
                  <Card style={[{ flexDirection: "row", alignItems: "center", gap: space.md }, on && { borderWidth: 2, borderColor: colors.blue }, (!isOpen || !!s.myStatus) && { opacity: 0.6 }]}>
                    <IconChip name={s.myStatus ? "checkmark-circle" : "qr-code"} tone={s.myStatus ? "success" : "blue"} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.body} numberOfLines={1}>{s.event.title}</Text>
                      <Text style={type.small}>{s.label} · {fmtTime(s.opensAt)} – {fmtTime(s.closesAt)}</Text>
                    </View>
                    {s.myStatus ? <Badge label="Done" tone="success" /> : isOpen ? <Badge label="Open" tone="success" /> : <Badge label={s.state === "opens_later" ? "Soon" : s.state === "not_active" ? "Not active" : "Closed"} tone="muted" />}
                  </Card>
                </Pressable>
              );
            })}

            {/* The QR panel: blue frame around the live camera, as in the reference's QR card. */}
            <View style={s.panel}>
              <Text style={s.panelTitle}>{active ? "Point at the QR code" : "Select an open session"}</Text>
              <Text style={s.panelSub}>{active ? `${active.event.title} · ${active.label}` : "Then scan the code shown by the organizer."}</Text>
              <View style={s.frame}>
                {!active ? (
                  <Placeholder icon="hand-left-outline" text="Pick a session above" />
                ) : outcome ? (
                  <View style={s.result}>
                    <Ionicons name={outcome.ok ? "checkmark-circle" : "close-circle"} size={64} color={outcome.ok ? colors.success : colors.danger} />
                    <Text style={[type.h2, { textAlign: "center", marginTop: space.sm }]}>{outcome.title}</Text>
                    <Text style={[type.small, { textAlign: "center", marginTop: 4 }]}>{outcome.text}</Text>
                  </View>
                ) : !permission ? (
                  <Loading />
                ) : permission.granted ? (
                  focused ? (
                    <CameraView
                      style={StyleSheet.absoluteFill}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                      onBarcodeScanned={busy ? undefined : (r) => void onCode(r.data)}
                    />
                  ) : null
                ) : (
                  <Placeholder icon="camera-outline" text={permission.canAskAgain ? "Camera access is needed to scan the QR code." : "Camera access is turned off for Tapasok."} />
                )}
              </View>
              {outcome ? (
                <Button label={outcome.ok ? "Done" : "Scan again"} variant="secondary" onPress={outcome.ok ? () => { again(); setSelected(null); } : again} />
              ) : active && permission && !permission.granted ? (
                permission.canAskAgain ? <Button label="Allow camera" icon="camera" onPress={() => void requestPermission()} /> : <Button label="Open settings" icon="settings-outline" onPress={() => void Linking.openSettings()} />
              ) : busy ? (
                <Text style={s.panelSub}>Checking…</Text>
              ) : null}
            </View>
            <Text style={type.small}>Your location is never used. Attendance is checked on the server against your registration for the event.</Text>
          </>
        )}
      </Body>
    </View>
  );
}

function Placeholder({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.result}>
      <Ionicons name={icon} size={48} color={colors.muted} />
      <Text style={[type.small, { textAlign: "center", marginTop: space.sm }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor: colors.blue, borderRadius: radius.lg, padding: space.lg, gap: space.md, alignItems: "stretch" },
  panelTitle: { color: colors.white, fontSize: 18, fontWeight: "800", textAlign: "center" },
  panelSub: { color: "#C9D4FF", fontSize: 13, textAlign: "center" },
  frame: { aspectRatio: 1, width: "100%", backgroundColor: colors.white, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  result: { alignItems: "center", justifyContent: "center", padding: space.xl },
});
