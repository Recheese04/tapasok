import { useState } from "react";
import { Image, View } from "react-native";
import { authedImage } from "../../src/api/client";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { useConfirm } from "../../src/components/kit";
import { Avatar, Badge, Body, Card, ListGroup, ListItem, ScreenHeader, SectionTitle, Txt } from "../../src/components/ui";
import { roleLabel } from "../../src/format";
import { hasPersonalFeatures, organizationsOf } from "../../src/roles";
import { colors, space } from "../../src/theme";

export default function Account() {
  const router = useRouter();
  const confirm = useConfirm();
  const { me, signOut, refreshMe } = useAuth();
  const [failedPhoto, setFailedPhoto] = useState<number | null>(null); // initials if the picture cannot be loaded
  if (!me) return null;
  const orgs = organizationsOf(me.memberships);
  const sp = me.student;

  async function confirmSignOut() {
    // Asked first so a stray tap never signs anyone out.
    if (await confirm({ title: "Sign out of Tapasok?", message: "You will need your email and password to sign in again on this device.", confirmLabel: "Sign out", cancelLabel: "Stay signed in", tone: "danger", icon: "log-out-outline" })) await signOut();
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow="Your account" title="Account" />
      <Body onRefresh={() => void refreshMe()} refreshing={false}>
        <Card style={{ gap: space.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            {me.photoVersion !== null && failedPhoto !== me.photoVersion ? <Image source={authedImage(`/me/photo?v=${me.photoVersion}`)} onError={() => setFailedPhoto(me.photoVersion)} accessibilityLabel="Your profile picture" style={{ width: 60, height: 60, borderRadius: 30 }} /> : <Avatar first={me.firstName} last={me.lastName} size={60} />}
            <View style={{ flex: 1 }}>
              <Txt variant="h2" numberOfLines={1}>{me.firstName} {me.lastName}</Txt>
              <Txt variant="small" numberOfLines={1}>{me.email}</Txt>
              {sp ? <Txt variant="small" color={colors.textMuted} numberOfLines={1}>{sp.studentNumber}{sp.yearLevel ? ` · Year ${sp.yearLevel}` : ""}</Txt> : null}
            </View>
          </View>
          {sp?.program ? (
            <View style={{ padding: space.md, borderRadius: 14, backgroundColor: colors.surfaceAlt, gap: 2 }}>
              <Txt variant="caption">Program</Txt>
              <Txt variant="bodyStrong">{sp.program}</Txt>
              {sp.college ? <Txt variant="small">{sp.college}</Txt> : null}
            </View>
          ) : null}
          {orgs.length ? (
            <View style={{ gap: space.sm }}>
              <Txt variant="caption">Positions</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {orgs.flatMap((o) => o.roles.map((r, i) => <Badge key={o.id + i} label={`${roleLabel(r.role, r.title)} · ${o.acronym ?? o.name}`} tone={r.role === "MEMBER" ? "neutral" : "violet"} />))}
              </View>
            </View>
          ) : null}
        </Card>

        <SectionTitle>Personal</SectionTitle>
        <ListGroup>
          <ListItem icon="person" tone="primary" title="Profile" subtitle="Contact details" onPress={() => router.push("/profile")} />
          {hasPersonalFeatures(orgs) ? <>
            <ListItem icon="wallet" tone="accent" title="My fees and payments" subtitle="What you owe and what you paid" onPress={() => router.push("/fees")} />
            <ListItem icon="people" tone="violet" title="My organizations" subtitle={`${orgs.length} organization${orgs.length === 1 ? "" : "s"}`} onPress={() => router.push("/organizations")} />
          </> : null}
        </ListGroup>

        <SectionTitle>Updates</SectionTitle>
        <ListGroup>
          <ListItem icon="notifications" tone="warning" title="Notifications" right={me.unread > 0 ? <Badge label={`${me.unread} new`} tone="danger" dot /> : undefined} onPress={() => router.push("/notifications")} />
          <ListItem icon="megaphone" tone="teal" title="Announcements" onPress={() => router.push("/announcements")} />
        </ListGroup>

        <ListGroup>
          <ListItem icon="log-out-outline" tone="danger" title="Sign out" chevron={false} onPress={() => void confirmSignOut()} />
        </ListGroup>
        <Txt variant="small" color={colors.textMuted} align="center" style={{ marginTop: space.sm }}>Tapasok mobile 1.0 · Passwords and account setup are managed on the website.</Txt>
      </Body>
    </View>
  );
}
