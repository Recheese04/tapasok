import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { Badge, Body, Card, Row, ScreenHeader, SectionTitle } from "../../src/components/ui";
import { roleLabel } from "../../src/format";
import { colors, space, type } from "../../src/theme";

export default function Account() {
  const router = useRouter();
  const { me, signOut, refreshMe } = useAuth();
  if (!me) return null;

  function confirmSignOut() {
    // Asked first so a stray tap never signs anyone out.
    Alert.alert("Sign out?", "You will be signed out of Tapasok on this device.", [
      { text: "Stay signed in", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={`${me.firstName} ${me.lastName}`} subtitle={me.student?.studentNumber ?? me.email} avatar={{ first: me.firstName, last: me.lastName }} />
      <Body onRefresh={() => void refreshMe()} refreshing={false}>
        <Card style={{ gap: space.sm }}>
          <Text style={type.small}>Email</Text>
          <Text style={type.body}>{me.email}</Text>
          {me.student?.program ? (<><Text style={[type.small, { marginTop: 6 }]}>Program</Text><Text style={type.body}>{me.student.program}{me.student.yearLevel ? ` · Year ${me.student.yearLevel}` : ""}</Text></>) : null}
          {me.memberships.length > 0 && (
            <View style={{ gap: 6, marginTop: 6 }}>
              <Text style={type.small}>Positions</Text>
              {me.memberships.map((m) => (
                <View key={m.organizationId + m.role} style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Badge label={roleLabel(m.role, m.title)} tone={m.role === "MEMBER" ? "muted" : "violet"} />
                  <Text style={type.body}>{m.acronym ?? m.organization}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <SectionTitle>My Tapasok</SectionTitle>
        <Row icon="person-outline" tone="blue" title="My profile" sub="View and update your contact details" onPress={() => router.push("/profile")} />
        <Row icon="people-outline" tone="violet" title="My organizations" sub="Organizations and your positions" onPress={() => router.push("/organizations")} />
        <Row icon="wallet-outline" tone="orange" title="Fees and payments" sub="What you owe and what you paid" onPress={() => router.push("/fees")} />
        <Row icon="megaphone-outline" tone="teal" title="Announcements" onPress={() => router.push("/announcements")} />
        <Row
          icon="notifications-outline" tone="warning" title="Notifications"
          right={me.unread > 0 ? <Badge label={`${me.unread} new`} tone="danger" /> : undefined}
          onPress={() => router.push("/notifications")}
        />

        <View style={{ marginTop: space.md }}>
          <Row icon="log-out-outline" tone="danger" title="Sign out" onPress={confirmSignOut} right={<Text style={{ color: colors.danger, fontWeight: "700" }}> </Text>} />
        </View>
        <Text style={[type.small, { textAlign: "center", marginTop: space.md }]}>Tapasok mobile 1.0 · Passwords and account setup are managed on the website.</Text>
      </Body>
    </View>
  );
}
