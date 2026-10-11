import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api/client";
import type { ManagedEvent } from "../../src/api/types";
import { DateTimeField, Field, Notice, Sheet, useConfirm, useToast } from "../../src/components/kit";
import { Badge, Body, Button, Card, Chips, DateBlock, Divider, Empty, ErrorState, Loading, ScreenHeader, Txt, type Tone } from "../../src/components/ui";
import { dayLabel, fmtTimeRange } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { colors, space } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

const STATUS: Record<string, [string, Tone]> = { DRAFT: ["Draft", "neutral"], PUBLISHED: ["Published", "success"], CANCELLED: ["Cancelled", "danger"] };
type Filter = "all" | "DRAFT" | "PUBLISHED" | "CANCELLED";

/** Create, publish and open check-in for events (events.manage; opening check-in needs attendance.scan, checked by the server). */
export default function ManageEvents() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { org, overview, reloadOverview } = useOrg();
  const orgId = org?.id ?? "";
  const params = useLocalSearchParams<{ new?: string }>();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgEvents(orgId), [orgId]);
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(params.new === "1");
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [details, setDetails] = useState("");
  const [startsAt, setStartsAt] = useState(() => { const d = new Date(Date.now() + 86_400_000); d.setMinutes(0, 0, 0); return d; });
  const [endsAt, setEndsAt] = useState(() => { const d = new Date(Date.now() + 86_400_000 + 7_200_000); d.setMinutes(0, 0, 0); return d; });
  const [busy, setBusy] = useState(false);
  const canOpen = overview?.capabilities["attendance.view_org"] ?? false; // positions that see attendance may open it; the server decides

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await fn(); toast.show(done); await Promise.all([refresh(), reloadOverview()]); return true; }
    catch (e) { toast.show(e instanceof ApiError ? e.message : "Something went wrong.", "error"); return false; }
    finally { setBusy(false); }
  }
  const create = async () => {
    if (endsAt <= startsAt) return toast.show("The end must be after the start.", "error");
    const ok = await run(() => api.createEvent(orgId, { title: title.trim(), venue: venue.trim(), description: details.trim() || undefined, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }), "Event saved as a draft");
    if (ok) { setCreating(false); setTitle(""); setVenue(""); setDetails(""); }
  };
  const setStatus = async (e: ManagedEvent, s: "DRAFT" | "PUBLISHED" | "CANCELLED") => {
    const copy = {
      PUBLISHED: { title: "Publish this event?", message: "Members of the organization will see it in their events.", confirmLabel: "Publish", done: "Event published" },
      DRAFT: { title: "Move back to draft?", message: "Members will no longer see it.", confirmLabel: "Move to draft", done: "Moved to draft" },
      CANCELLED: { title: "Cancel this event?", message: "Check-in closes and members see it as cancelled. This cannot be undone here.", confirmLabel: "Cancel event", done: "Event cancelled" },
    }[s];
    if (await confirm({ ...copy, tone: s === "PUBLISHED" ? "primary" : "danger", cancelLabel: "Go back", icon: s === "PUBLISHED" ? "send-outline" : s === "CANCELLED" ? "close-circle-outline" : "eye-off-outline" })) await run(() => api.setEventStatus(orgId, e.id, s), copy.done);
  };

  const all = data?.events ?? [];
  const list = all.filter((e) => filter === "all" || e.status === filter);
  const drafts = all.filter((e) => e.status === "DRAFT").length;
  const valid = title.trim().length >= 2 && venue.trim().length >= 2;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={org?.name} title="Manage events" back={() => router.back()}>
        <Chips<Filter> onDark value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "DRAFT", label: "Drafts", count: drafts }, { value: "PUBLISHED", label: "Published" }, { value: "CANCELLED", label: "Cancelled" }]} />
      </ScreenHeader>
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          <Button label="New event" icon="add" onPress={() => setCreating(true)} />
          {list.length === 0 ? <Empty icon="calendar-clear-outline" title="No events here" text="Create an event; it stays a draft until you publish it." tone="violet" /> : list.map((e) => {
            const st = STATUS[e.status] ?? [e.status, "neutral" as Tone];
            return (
              <Card key={e.id} style={{ gap: space.md }}>
                <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                  <DateBlock iso={e.startsAt} tone={e.status === "PUBLISHED" ? "primary" : "neutral"} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Badge label={st[0]} tone={st[1]} dot />
                    <Txt variant="h3" numberOfLines={2}>{e.title}</Txt>
                    <Txt variant="small" numberOfLines={1}>{dayLabel(e.startsAt)} · {fmtTimeRange(e.startsAt, e.endsAt)}{e.venue ? ` · ${e.venue}` : ""}</Txt>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <Badge label={`${e.checkIns} check-in${e.checkIns === 1 ? "" : "s"}`} tone="info" icon="checkmark-done" />
                  <Badge label={`${e.sessions.length} session${e.sessions.length === 1 ? "" : "s"}`} tone="neutral" />
                </View>
                {e.status === "PUBLISHED" && canOpen && e.sessions.length ? (
                  <View style={{ gap: space.sm, padding: space.md, borderRadius: 14, backgroundColor: colors.surfaceAlt }}>
                    <Txt variant="caption">Check-in</Txt>
                    {e.sessions.map((x) => (
                      <View key={x.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                        <View style={{ flex: 1 }}>
                          <Txt variant="bodyStrong">{x.label}</Txt>
                          <Txt variant="small" color={x.finalized ? colors.textMuted : x.active ? colors.successInk : colors.textMuted}>{x.finalized ? "Finalized" : x.active ? "Open — members can scan" : "Closed"}</Txt>
                        </View>
                        {x.finalized ? null : <Button label={x.active ? "Close" : "Open"} size="sm" variant={x.active ? "danger" : "primary"} disabled={busy} onPress={() => void run(() => api.setSessionActive(orgId, e.id, x.id, !x.active), x.active ? "Check-in closed" : "Check-in is open")} />}
                      </View>
                    ))}
                  </View>
                ) : null}
                {e.status !== "CANCELLED" ? (
                  <>
                    <Divider />
                    <View style={{ flexDirection: "row", gap: space.sm }}>
                      {e.status === "DRAFT" ? <View style={{ flex: 1 }}><Button label="Publish" icon="send" size="sm" disabled={busy} onPress={() => void setStatus(e, "PUBLISHED")} /></View> : null}
                      {e.status === "PUBLISHED" && e.checkIns === 0 ? <View style={{ flex: 1 }}><Button label="Unpublish" variant="ghost" size="sm" disabled={busy} onPress={() => void setStatus(e, "DRAFT")} /></View> : null}
                      <View style={{ flex: 1 }}><Button label="Cancel" variant="danger" size="sm" disabled={busy} onPress={() => void setStatus(e, "CANCELLED")} /></View>
                    </View>
                  </>
                ) : null}
              </Card>
            );
          })}
          <Notice icon="desktop-outline" tone="info" title="More options on the website" text="Audiences, several sessions and consequence rules are set on the Tapasok website." />
        </Body>
      )}
      <Sheet visible={creating} onClose={() => setCreating(false)} title="New event" subtitle="Saved as a draft until you publish it">
        <Field label="Title" icon="text-outline" value={title} onChangeText={setTitle} maxLength={150} placeholder="e.g. Foundation Day" />
        <Field label="Venue" icon="location-outline" value={venue} onChangeText={setVenue} maxLength={200} placeholder="e.g. University gym" />
        <DateTimeField label="Starts" value={startsAt} onChange={(d) => { setStartsAt(d); if (endsAt <= d) setEndsAt(new Date(d.getTime() + 7_200_000)); }} />
        <DateTimeField label="Ends" value={endsAt} onChange={setEndsAt} />
        <Field label="Details (optional)" value={details} onChangeText={setDetails} multiline maxLength={2000} />
        <Notice icon="information-circle" tone="info" title="One attendance session" text="For all members. Check-in opens 30 minutes before the start, with 15 minutes grace." />
        <Button label="Save event" icon="checkmark" size="lg" loading={busy} disabled={!valid} onPress={() => void create()} />
      </Sheet>
    </View>
  );
}
