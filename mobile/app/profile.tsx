import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, api } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";
import { Field, Notice, useToast } from "../src/components/kit";
import { Avatar, Body, Button, Card, Divider, ScreenHeader, SectionTitle, Txt } from "../src/components/ui";
import { colors, space } from "../src/theme";

/** Students may edit only their contact details. Name, student number, program and email are managed by an administrator. */
export default function Profile() {
  const router = useRouter();
  const toast = useToast();
  const { me, setMe } = useAuth();
  const sp = me?.student;
  const [middleName, setMiddleName] = useState(sp?.middleName ?? "");
  const [contactNumber, setContactNumber] = useState(sp?.contactNumber ?? "");
  const [streetAddress, setStreetAddress] = useState(sp?.streetAddress ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const dirty = middleName !== (sp?.middleName ?? "") || contactNumber !== (sp?.contactNumber ?? "") || streetAddress !== (sp?.streetAddress ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      setMe(await api.updateProfile({ middleName, contactNumber, streetAddress }));
      toast.show("Profile saved");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader eyebrow="Personal" title="Profile" back={() => router.back()} />
      <Body tabs={false}>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Avatar first={me.firstName} last={me.lastName} size={56} />
            <View style={{ flex: 1 }}>
              <Txt variant="h2">{me.firstName} {sp?.middleName ? `${sp.middleName} ` : ""}{me.lastName}</Txt>
              <Txt variant="small">{me.email}</Txt>
            </View>
          </View>
          <Divider />
          {sp ? <Fixed icon="id-card-outline" label="Student number" value={sp.studentNumber} /> : null}
          {sp?.program ? <Fixed icon="school-outline" label="Program" value={sp.program} /> : null}
          {sp?.college ? <Fixed icon="business-outline" label="College" value={sp.college} /> : null}
          {sp?.address ? <Fixed icon="location-outline" label="Address" value={sp.address} /> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted}>Managed by your administrator</Txt>
          </View>
        </Card>

        {sp ? (
          <>
            <SectionTitle caption="You can update these yourself">Contact details</SectionTitle>
            <Card style={{ gap: space.lg }}>
              <Field label="Middle name" icon="person-outline" value={middleName} onChangeText={setMiddleName} maxLength={60} />
              <Field label="Contact number" icon="call-outline" value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" placeholder="09XXXXXXXXX" hint="11 digits, starting with 09" maxLength={13} />
              <Field label="Street address" icon="home-outline" value={streetAddress} onChangeText={setStreetAddress} maxLength={200} placeholder="House no., street, purok" />
              {error ? <Notice icon="alert-circle" tone="danger" title="Not saved" text={error} /> : null}
              <Button label="Save changes" icon="checkmark" loading={busy} disabled={!dirty} onPress={() => void save()} />
            </Card>
          </>
        ) : (
          <Notice icon="information-circle" tone="info" title="No student profile" text="No student profile is linked to your account." />
        )}
      </Body>
    </KeyboardAvoidingView>
  );
}

function Fixed({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Txt variant="caption">{label}</Txt>
        <Txt variant="bodyStrong">{value}</Txt>
      </View>
    </View>
  );
}
