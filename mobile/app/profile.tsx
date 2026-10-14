import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, api, authedImage, uploadOwnPhoto } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";
import { Field, Notice, useConfirm, useToast } from "../src/components/kit";
import { Avatar, Body, Button, Card, Divider, ScreenHeader, SectionTitle, Txt } from "../src/components/ui";
import { colors, radius, space } from "../src/theme";

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
            {me.photoVersion !== null ? <Image source={authedImage(`/me/photo?v=${me.photoVersion}`)} accessibilityLabel="Your profile picture" style={{ width: 56, height: 56, borderRadius: 18 }} /> : <Avatar first={me.firstName} last={me.lastName} size={56} />}
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

        <SectionTitle caption="Only you can change it">Profile picture</SectionTitle>
        <PhotoCard />

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

/** The signed-in person's own picture: pick (square crop), preview, save with progress, or remove. */
function PhotoCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const { me, refreshMe } = useAuth();
  const [picked, setPicked] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const busy = progress !== null;

  const pick = async () => {
    setError(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    if (a.fileSize && a.fileSize > 5 * 1024 * 1024) { setError("The picture is too large. Use one under 5 MB."); return; }
    setPicked(a);
  };
  const save = async () => {
    if (!picked) return;
    setError(null); setProgress(0);
    try {
      const type = picked.mimeType ?? "image/jpeg";
      await uploadOwnPhoto({ uri: picked.uri, mimeType: type, name: picked.fileName ?? `photo.${type.split("/")[1] ?? "jpg"}` }, setProgress);
      await refreshMe();
      setPicked(null);
      toast.show("Profile picture saved");
    } catch (e) { setError(e instanceof ApiError ? e.message : "The picture could not be saved. Try again."); }
    finally { setProgress(null); }
  };
  const remove = async () => {
    if (!(await confirm({ title: "Remove your profile picture?", message: "Your initials will be shown instead.", confirmLabel: "Remove", tone: "danger", icon: "trash-outline" }))) return;
    setProgress(100);
    try { await api.removeOwnPhoto(); await refreshMe(); toast.show("Profile picture removed"); }
    catch (e) { setError(e instanceof ApiError ? e.message : "The picture could not be removed."); }
    finally { setProgress(null); }
  };

  const size = 112;
  return (
    <Card style={{ alignItems: "center", gap: space.md }}>
      {picked ? <Image source={{ uri: picked.uri }} accessibilityLabel="Preview of your new picture" style={{ width: size, height: size, borderRadius: radius.lg }} />
        : me.photoVersion !== null ? <Image source={authedImage(`/me/photo?v=${me.photoVersion}`)} accessibilityLabel="Your profile picture" style={{ width: size, height: size, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt }} />
        : <Avatar first={me.firstName} last={me.lastName} size={size} />}
      <Txt variant="small" align="center">{picked ? "Preview. Save it to use it everywhere, including on the officers' screen when you tap your card." : "Shown to officers in your organizations, for example when you tap your RFID card."}</Txt>
      {progress !== null && picked ? (
        <View style={{ alignSelf: "stretch", gap: 4 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }}>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primarySoft, overflow: "hidden" }}><View style={{ width: `${progress}%`, height: 8, backgroundColor: colors.primary }} /></View>
          <Txt variant="small" align="center">{progress < 100 ? `Uploading ${progress}%` : "Processing…"}</Txt>
        </View>
      ) : null}
      {error ? <Notice icon="alert-circle" tone="danger" title="Not saved" text={error} /> : null}
      <View style={{ flexDirection: "row", gap: space.sm, alignSelf: "stretch" }}>
        {picked ? (
          <>
            <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" disabled={busy} onPress={() => setPicked(null)} /></View>
            <View style={{ flex: 1 }}><Button label="Save" icon="checkmark" loading={busy} onPress={() => void save()} /></View>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }}><Button label={me.photoVersion !== null ? "Change" : "Choose picture"} icon="image-outline" disabled={busy} onPress={() => void pick()} /></View>
            {me.photoVersion !== null ? <View style={{ flex: 1 }}><Button label="Remove" variant="danger" disabled={busy} onPress={() => void remove()} /></View> : null}
          </>
        )}
      </View>
    </Card>
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
