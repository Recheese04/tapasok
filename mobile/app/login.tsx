import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";
import { Button, Card, Rings, Txt } from "../src/components/ui";
import { colors, fonts, gradients, radius, space } from "../src/theme";

export default function Login() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<"email" | "password" | null>(null);
  const passRef = useRef<TextInput>(null);

  async function submit() {
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <LinearGradient colors={gradients.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, { paddingTop: insets.top + 48 }]}>
          <Rings size={340} right={-120} top={-120} />
          <View style={s.logo}><Ionicons name="school" size={34} color={colors.navy900} /></View>
          <Txt variant="display" color={colors.onDark} style={{ marginTop: space.lg }}>Tapasok</Txt>
          <Txt variant="body" color={colors.onDarkMuted} align="center" style={{ marginTop: 4, maxWidth: 280 }}>Events, attendance and dues for your student organizations.</Txt>
        </LinearGradient>

        <View style={{ paddingHorizontal: space.lg, marginTop: -56, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
          <Card style={{ gap: space.lg, padding: space.xl }}>
            <View>
              <Txt variant="h1">Welcome back</Txt>
              <Txt variant="small" style={{ marginTop: 2 }}>Use the same email and password as the Tapasok website.</Txt>
            </View>
            <View>
              <Txt variant="label" style={{ marginBottom: 6 }}>Email</Txt>
              <View style={[s.input, focus === "email" && s.focus]}>
                <Ionicons name="mail-outline" size={18} color={focus === "email" ? colors.primary : colors.textMuted} />
                <TextInput
                  style={s.text} value={email} onChangeText={setEmail} placeholder="you@bisu.edu.ph" placeholderTextColor={colors.textMuted} accessibilityLabel="Email"
                  autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email"
                  returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} editable={!busy} onFocus={() => setFocus("email")} onBlur={() => setFocus(null)}
                />
              </View>
            </View>
            <View>
              <Txt variant="label" style={{ marginBottom: 6 }}>Password</Txt>
              <View style={[s.input, focus === "password" && s.focus]}>
                <Ionicons name="lock-closed-outline" size={18} color={focus === "password" ? colors.primary : colors.textMuted} />
                <TextInput
                  ref={passRef} style={s.text} value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={colors.textMuted} accessibilityLabel="Password"
                  secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="current-password"
                  returnKeyType="go" onSubmitEditing={submit} editable={!busy} onFocus={() => setFocus("password")} onBlur={() => setFocus(null)}
                />
                <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={show ? "Hide password" : "Show password"} style={s.eye}>
                  <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
            {error ? (
              <View accessibilityRole="alert" style={s.error}>
                <Ionicons name="alert-circle" size={18} color={colors.dangerInk} />
                <Txt variant="small" color={colors.dangerInk} style={{ flex: 1 }}>{error}</Txt>
              </View>
            ) : null}
            <Button label="Sign in" size="lg" onPress={submit} loading={busy} />
          </Card>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start", paddingHorizontal: space.sm }}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>New account or forgot your password? Use the setup link sent to you, or ask your organization officer.</Txt>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: "center", paddingBottom: 92, paddingHorizontal: space.xl, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, overflow: "hidden" },
  logo: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: space.md },
  focus: { borderColor: colors.primary, backgroundColor: colors.surface },
  text: { flex: 1, minHeight: 48, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  eye: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  error: { flexDirection: "row", gap: space.sm, alignItems: "center", padding: space.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
});
