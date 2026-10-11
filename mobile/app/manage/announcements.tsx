import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api/client";
import { Field, Sheet, useConfirm, useToast } from "../../src/components/kit";
import { Badge, Body, Button, Card, Chips, Empty, ErrorState, Loading, ScreenHeader, Txt } from "../../src/components/ui";
import { ago } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { colors, space } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

/** Post and publish announcements for the active organization (announcements.manage). Audience targeting stays on the web. */
export default function ManageAnnouncements() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { org } = useOrg();
  const orgId = org?.id ?? "";
  const params = useLocalSearchParams<{ new?: string }>();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgAnnouncements(orgId), [orgId]);
  const [filter, setFilter] = useState<"all" | "PUBLISHED" | "DRAFT">("all");
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
    if (publish && !(await confirm({ title: "Post to all members?", message: `Everyone in ${org?.name} will be notified.`, confirmLabel: "Post now", icon: "megaphone-outline" }))) return;
    if (await run(() => api.postAnnouncement(orgId, title.trim(), body.trim(), publish), publish ? "Announcement posted" : "Saved as draft")) { setComposing(false); setTitle(""); setBody(""); }
  };
  const list = (data?.announcements ?? []).filter((a) => filter === "all" || a.status === filter);
  const drafts = (data?.announcements ?? []).filter((a) => a.status === "DRAFT").length;
  const valid = title.trim().length >= 3 && !!body.trim();

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={org?.name} title="Announcements" back={() => router.back()}>
        <Chips onDark value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "PUBLISHED", label: "Published" }, { value: "DRAFT", label: "Drafts", count: drafts }]} />
      </ScreenHeader>
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          <Button label="New announcement" icon="create-outline" onPress={() => setComposing(true)} />
          {list.length === 0 ? <Empty icon="megaphone-outline" title={filter === "DRAFT" ? "No drafts" : "Nothing posted yet"} text="Post an update and every member is notified." tone="teal" /> : list.map((a) => (
            <Card key={a.id} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Badge label={a.status === "PUBLISHED" ? "Published" : "Draft"} tone={a.status === "PUBLISHED" ? "success" : "neutral"} dot />
                <Txt variant="small" color={colors.textMuted}>{ago(a.at)}</Txt>
              </View>
              <Txt variant="h3">{a.title}</Txt>
              <Txt variant="body" color={colors.textSecondary} numberOfLines={4}>{a.body}</Txt>
              {a.status === "DRAFT" ? (
                <Button label="Publish to members" variant="secondary" size="sm" icon="send" disabled={busy} onPress={async () => { if (await confirm({ title: "Publish this announcement?", message: "Every member of the organization will be notified.", confirmLabel: "Publish", icon: "megaphone-outline" })) await run(() => api.setAnnouncementStatus(orgId, a.id, "PUBLISHED"), "Announcement published"); }} />
              ) : (
                <Button label="Move back to draft" variant="ghost" size="sm" disabled={busy} onPress={async () => { if (await confirm({ title: "Unpublish this announcement?", message: "Members will no longer see it.", confirmLabel: "Move to draft", tone: "danger", icon: "eye-off-outline" })) await run(() => api.setAnnouncementStatus(orgId, a.id, "DRAFT"), "Moved to draft"); }} />
              )}
            </Card>
          ))}
        </Body>
      )}
      <Sheet visible={composing} onClose={() => setComposing(false)} title="New announcement" subtitle={`To all members of ${org?.name ?? "the organization"}`}>
        <Field label="Title" icon="text-outline" value={title} onChangeText={setTitle} maxLength={150} placeholder="e.g. General assembly this Friday" />
        <Field label="Message" value={body} onChangeText={setBody} multiline maxLength={5000} placeholder="Write the announcement" hint={`${body.length}/5000`} />
        <View style={{ gap: space.sm }}>
          <Button label="Post now" icon="send" size="lg" loading={busy} disabled={!valid} onPress={() => void post(true)} />
          <Button label="Save as draft" variant="ghost" disabled={busy || !valid} onPress={() => void post(false)} />
        </View>
      </Sheet>
    </View>
  );
}
