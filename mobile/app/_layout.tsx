import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { ErrorState, Loading } from "../src/components/ui";
import { ApiError } from "../src/api/client";
import { ToastProvider } from "../src/components/kit";
import { OrgProvider } from "../src/org/OrgContext";
import { colors } from "../src/theme";

function Gate() {
  const { status, me, offline, refreshMe } = useAuth();
  if (status === "loading") return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}><Loading /></View>;
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
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="event/[id]" />
        <Stack.Screen name="organizations" />
        <Stack.Screen name="fees" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="announcements" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="manage/finance" />
        <Stack.Screen name="manage/announcements" />
        <Stack.Screen name="manage/events" />
        <Stack.Screen name="manage/members" />
        <Stack.Screen name="manage/documents" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <OrgProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <Gate />
          </ToastProvider>
        </OrgProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
