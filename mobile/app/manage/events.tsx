import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api/client";
import type { ManagedEvent } from "../../src/api/types";
import { DateTimeField, Field, Sheet, useToast } from "../../src/components/kit";
import { Badge, Body, Button, Card, Empty, ErrorState, Loading, ScreenHeader, type Tone } from "../../src/components/ui";
import { fmtDate, fmtTime } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { colors, space, type } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

const STATUS: Record<string, [string, Tone]> = { DRAFT: ["Draft", "muted"], PUBLISHED: ["Published", "success"], CANCELLED: ["Cancelled", "danger"] };

/** Create, publish and open check-in for events (events.manage; opening check-in needs attendance.scan). */
export default function ManageEvents() {
  const router = useRouter();
  const toast = useToast();
  const { org, overview, reloadOverview } = useOrg();
  const orgId = org?.id ?? "";
  const params = useLocalSearchParams<{ new?: string }>();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgEvents(orgId), [orgId]);
  const [creating, setCreating] = useState(params.new === "1");
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [details, setDetails] = useState("");
  const [startsAt, setStartsAt] = useState(() => { const d = new Date(Date.now() + 86_400_000); d.setMinutes(0, 0, 0); return d; });
  const [endsAt, setEndsAt] = useState(() => { const d = new Date(Date.now() + 86_400_000 + 7_200_000); d.setMinutes(0, 0, 0); return d; });
  const [busy, setBusy] = useState(false);

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
  const status = (e: ManagedEvent, s: "DRAFT" | "PUBLISHED" | "CANCELLED", message: string) =>
    Alert.alert(s === "CANCELLED" ? "Cancel this event?" : s === "PUBLISHED" ? "Publish this event?" : "Move back to draft?", s === "PUBLISHED" ? "Members of the organization will be able to see it." : s === "CANCELLED" ? "Check-in will be closed." : "It will be hidden from members.", [
      { text: "Back", style: "cancel" }, { text: "Yes", style: s === "CANCELLED" ? "destructive" : "default", onPress: () => void run(() => api.setEventStatus(orgId, e.id, s), message) },
    ]);
  const canScan = overview?.capabilities["attendance.view_org"] ?? false; // officers who may see attendance may also open it (server decides)

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Manage events" subtitle={org?.name} back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          <Button label="New event" icon="add" onPress={() => setCreating(true)} />
          {data?.events.length === 0 ? <Empty icon="calendar-outline" title="No events yet" /> : data?.events.map((e) => {
            const st = STATUS[e.status] ?? [e.status, "muted" as Tone];
            return (
              <Card key={e.id} style={{ gap: space.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={type.small}>{fmtDate(e.startsAt)} · {fmtTime(e.startsAt)}</Text>
                  <Badge label={st[0]} tone={st[1]} />
                </View>
                <Text style={type.h2}>{e.title}</Text>
                <Text style={type.small}>{e.venue ?? "No venue"} · {e.checkIns} check-in{e.checkIns === 1 ? "" : "s"}</Text>
                {e.status === "PUBLISHED" && canScan ? e.sessions.map((s) => (
                  <View key={s.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
                    <Text style={type.body}>{s.label}{s.finalized ? " · finalized" : ""}</Text>
                    {s.finalized ? <Badge label="Closed" tone="muted" /> : (
                      <View style={{ minWidth: 150 }}>
                        <Button label={s.active ? "Close check-in" : "Open check-in"} variant={s.active ? "danger" : "secondary"} disabled={busy} onPress={() => void run(() => api.setSessionActive(orgId, e.id, s.id, !s.active), s.active ? "Check-in closed" : "Check-in is open")} />
                      </View>
                    )}
                  </View>
                )) : null}
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  {e.status === "DRAFT" ? <View style={{ flex: 1 }}><Button label="Publish" icon="send" disabled={busy} onPress={() => status(e, "PUBLISHED", "Event published")} /></View> : null}
                  {e.status === "PUBLISHED" && e.checkIns === 0 ? <View style={{ flex: 1 }}><Button label="Unpublish" variant="secondary" disabled={busy} onPress={() => status(e, "DRAFT", "Moved to draft")} /></View> : null}
                  {e.status !== "CANCELLED" ? <View style={{ flex: 1 }}><Button label="Cancel event" variant="danger" disabled={busy} onPress={() => status(e, "CANCELLED", "Event cancelled")} /></View> : null}
                </View>
              </Card>
            );
          })}
          <Text style={{ color: colors.muted, fontSize: 12 }}>Audiences, several sessions and consequence rules are set on the web.</Text>
        </Body>
      )}
      <Sheet visible={creating} onClose={() => setCreating(false)} title="New event">
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={150} />
        <Field label="Venue" value={venue} onChangeText={setVenue} maxLength={200} />
        <DateTimeField label="Starts" value={startsAt} onChange={(d) => { setStartsAt(d); if (endsAt <= d) setEndsAt(new Date(d.getTime() + 7_200_000)); }} />
        <DateTimeField label="Ends" value={endsAt} onChange={setEndsAt} />
        <Field label="Details (optional)" value={details} onChangeText={setDetails} multiline maxLength={2000} />
        <Text style={type.small}>For all members, with one attendance session: opens 30 minutes before the start, 15 minutes grace. Saved as a draft until you publish.</Text>
        <Button label="Save event" loading={busy} disabled={title.trim().length < 2 || venue.trim().length < 2} onPress={() => void create()} />
      </Sheet>
    </View>
  );
}
