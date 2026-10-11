import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api/client";
import { Field, Sheet, useToast } from "../../src/components/kit";
import { Badge, Body, Button, Card, Empty, ErrorState, Loading, ScreenHeader } from "../../src/components/ui";
import { fmtDate } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { space, type } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

/** Post and publish announcements for the active organization (announcements.manage). Audience targeting stays on the web. */
export default function ManageAnnouncements() {
  const router = useRouter();
  const toast = useToast();
  const { org } = useOrg();
  const orgId = org?.id ?? "";
  const params = useLocalSearchParams<{ new?: string }>();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgAnnouncements(orgId), [orgId]);
  const [composing, setComposing] = useState(params.new === "1");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await fn(); toast.show(done); await refresh(); return true; }
    catch (e) { toast.show(e instanceof ApiError ? e.message : "Something went wrong.", "error"); return false; }
    finally { setBusy(false); }
  }
  const post = async (publish: boolean) => {
    if (await run(() => api.postAnnouncement(orgId, title.trim(), body.trim(), publish), publish ? "Announcement posted" : "Saved as draft")) { setComposing(false); setTitle(""); setBody(""); }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Announcements" subtitle={org?.name} back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          <Button label="New announcement" icon="add" onPress={() => setComposing(true)} />
          {data?.announcements.length === 0 ? <Empty icon="megaphone-outline" title="No announcements yet" text="Post one and every member is notified." /> : data?.announcements.map((a) => (
            <Card key={a.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={type.small}>{fmtDate(a.at)}</Text>
                <Badge label={a.status === "PUBLISHED" ? "Published" : "Draft"} tone={a.status === "PUBLISHED" ? "success" : "muted"} />
              </View>
              <Text style={type.h2}>{a.title}</Text>
              <Text style={type.body} numberOfLines={4}>{a.body}</Text>
              {a.status === "DRAFT" ? (
                <Button label="Publish to members" variant="secondary" icon="send" disabled={busy} onPress={() => Alert.alert("Publish this announcement?", "Every member of the organization will be notified.", [{ text: "Cancel", style: "cancel" }, { text: "Publish", onPress: () => void run(() => api.setAnnouncementStatus(orgId, a.id, "PUBLISHED"), "Announcement published") }])} />
              ) : (
                <Button label="Move back to draft" variant="secondary" disabled={busy} onPress={() => void run(() => api.setAnnouncementStatus(orgId, a.id, "DRAFT"), "Moved to draft")} />
              )}
            </Card>
          ))}
        </Body>
      )}
      <Sheet visible={composing} onClose={() => setComposing(false)} title="New announcement">
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={150} placeholder="e.g. General assembly this Friday" />
        <Field label="Message" value={body} onChangeText={setBody} multiline maxLength={5000} placeholder="Write the announcement" />
        <Text style={type.small}>Sent to all members of {org?.name}.</Text>
        <View style={{ gap: space.sm }}>
          <Button label="Post now" icon="send" loading={busy} disabled={title.trim().length < 3 || !body.trim()} onPress={() => void post(true)} />
          <Button label="Save as draft" variant="secondary" disabled={busy || title.trim().length < 3 || !body.trim()} onPress={() => void post(false)} />
        </View>
      </Sheet>
    </View>
  );
}
