import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";
import { Button, Card } from "../src/components/ui";
import { colors, radius, space, type } from "../src/theme";

export default function Login() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        <LinearGradient colors={[colors.blueDeep, colors.blue]} style={[s.hero, { paddingTop: insets.top + 56 }]}>
          <View style={s.logo}><Ionicons name="school" size={34} color={colors.blue} /></View>
          <Text style={s.brand}>Tapasok</Text>
          <Text style={s.tag}>Your student organizations, in your pocket.</Text>
        </LinearGradient>

        <View style={{ padding: space.lg, marginTop: -space.xxl, gap: space.md }}>
          <Card style={{ gap: space.md }}>
            <Text style={type.h2}>Sign in</Text>
            <Text style={type.small}>Use the same email and password as the Tapasok website.</Text>
            <View>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input} value={email} onChangeText={setEmail} placeholder="you@bisu.edu.ph" placeholderTextColor={colors.muted}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email"
                returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} editable={!busy}
              />
            </View>
            <View>
              <Text style={s.label}>Password</Text>
              <View>
                <TextInput
                  ref={passRef} style={[s.input, { paddingRight: 48 }]} value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={colors.muted}
                  secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="current-password"
                  returnKeyType="go" onSubmitEditing={submit} editable={!busy}
                />
                <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityLabel={show ? "Hide password" : "Show password"} style={s.eye}>
                  <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
                </Pressable>
              </View>
            </View>
            {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
            <Button label="Sign in" onPress={submit} loading={busy} />
          </Card>
          <Text style={[type.small, { textAlign: "center" }]}>
            New account or forgot your password? Ask your organization officer or use the setup link sent to you.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: "center", paddingBottom: 72, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  logo: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  brand: { color: colors.white, fontSize: 32, fontWeight: "800", marginTop: space.md },
  tag: { color: "#C9D4FF", marginTop: 4 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
  input: { minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: space.md, fontSize: 15, color: colors.text },
  eye: { position: "absolute", right: 14, top: 14 },
});
