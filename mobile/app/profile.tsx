import { useState } from "react";
import { Text, TextInput, View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ApiError, api } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";
import { Body, Button, Card, ScreenHeader } from "../src/components/ui";
import { colors, radius, space, type } from "../src/theme";

/** Students may edit only their contact details. Name, student number, program and email are managed by an administrator. */
export default function Profile() {
  const router = useRouter();
  const { me, setMe } = useAuth();
  const sp = me?.student;
  const [middleName, setMiddleName] = useState(sp?.middleName ?? "");
  const [contactNumber, setContactNumber] = useState(sp?.contactNumber ?? "");
  const [streetAddress, setStreetAddress] = useState(sp?.streetAddress ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!me) return null;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      setMe(await api.updateProfile({ middleName, contactNumber, streetAddress }));
      setMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="My profile" back={() => router.back()} />
      <Body tabs={false}>
        <Card style={{ gap: 6 }}>
          <Fixed label="Name" value={`${me.firstName} ${me.lastName}`} />
          <Fixed label="Email" value={me.email} />
          {sp ? <Fixed label="Student number" value={sp.studentNumber} /> : null}
          {sp?.program ? <Fixed label="Program" value={sp.program} /> : null}
          {sp?.college ? <Fixed label="College" value={sp.college} /> : null}
          <Text style={[type.small, { marginTop: 6 }]}>These are managed by your administrator.</Text>
        </Card>
        {sp ? (
          <Card style={{ gap: space.md }}>
            <Field label="Middle name" value={middleName} onChange={setMiddleName} />
            <Field label="Contact number" value={contactNumber} onChange={setContactNumber} keyboardType="phone-pad" placeholder="09XXXXXXXXX" />
            <Field label="Street address" value={streetAddress} onChange={setStreetAddress} />
            {msg ? <Text accessibilityRole="alert" style={{ color: msg.ok ? colors.success : colors.danger, fontSize: 13 }}>{msg.text}</Text> : null}
            <Button label="Save changes" onPress={save} loading={busy} />
          </Card>
        ) : (
          <Card><Text style={type.body}>No student profile is linked to your account.</Text></Card>
        )}
      </Body>
    </View>
  );
}

function Fixed({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={type.small}>{label}</Text>
      <Text style={type.body}>{value}</Text>
    </View>
  );
}

function Field({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void; keyboardType?: "phone-pad"; placeholder?: string }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={onChange} placeholderTextColor={colors.muted} {...rest} />
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
  input: { minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: space.md, fontSize: 15, color: colors.text },
});
