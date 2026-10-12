import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { ErrorState, Rings, Spot, Txt } from "../src/components/ui";
import { ApiError } from "../src/api/client";
import { ConfirmProvider, ToastProvider } from "../src/components/kit";
import { OrgProvider } from "../src/org/OrgContext";
import { colors, gradients, space } from "../src/theme";

/** Branded launch screen while the session is restored. */
function Splash() {
  return (
    <LinearGradient colors={gradients.header} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Rings size={420} right={-160} top={-140} />
      <View style={{ width: 76, height: 76, borderRadius: 24, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
        <Txt variant="display" color={colors.navy900}>T</Txt>
      </View>
      <Txt variant="h1" color={colors.onDark} style={{ marginTop: space.lg }}>Tapasok</Txt>
    </LinearGradient>
  );
}

function Gate() {
  const { status, me, offline, refreshMe } = useAuth();
  if (status === "loading") return <Splash />;
  // Signed in earlier but the server could not be reached at launch: keep the session and let the member retry.
  if (status === "signedIn" && !me && offline) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <ErrorState error={new ApiError(0, "NETWORK", "No connection. Check your internet and try again.")} onRetry={refreshMe} />
      </View>
    );
  }
  const signedIn = status === "signedIn" && !!me;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: "slide_from_right" }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="event/[id]" />
        <Stack.Screen name="organizations" />
        <Stack.Screen name="fees" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="announcements" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="manage/finance" />
        <Stack.Screen name="manage/expenses" />
        <Stack.Screen name="manage/announcements" />
        <Stack.Screen name="manage/events" />
        <Stack.Screen name="manage/members" />
        <Stack.Screen name="manage/member/[userId]" />
        <Stack.Screen name="manage/documents" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ animation: "fade" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  // If the font cannot load the app still works with the system font; it never blocks sign-in.
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.navy900 }}><Spot icon="school" size={1} /></View>;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <OrgProvider>
          <ToastProvider>
            <ConfirmProvider>
              <StatusBar style="light" />
              <Gate />
            </ConfirmProvider>
          </ToastProvider>
        </OrgProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
