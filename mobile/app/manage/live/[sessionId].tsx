import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Image, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, api, authedImage } from "../../../src/api/client";
import type { LiveCheckIn, LiveData, LiveRejection } from "../../../src/api/types";
import { Avatar, Badge, Body, Button, Card, ErrorState, ListGroup, Loading, ScreenHeader, SectionTitle, StatTile, TileGrid, Txt } from "../../../src/components/ui";
import { useOrg } from "../../../src/org/OrgContext";
import { colors, radius, space } from "../../../src/theme";

const POLL_MS = 2500;
const SPOTLIGHT_MS = 12_000; // a tap stays in the spotlight this long
const MAX_SPOTS = 4; // during a rush, the last few taps are shown together so every face can be checked
const STATE: Record<LiveData["session"]["state"], { tone: "success" | "warning" | "neutral"; title: string; text: string }> = {
  open: { tone: "success", title: "Check-in is open", text: "Cards tapped on the readers are recorded here." },
  not_activated: { tone: "warning", title: "Check-in is closed", text: "No attendance is open. Tap Open on the session in Manage events." },
  not_started: { tone: "neutral", title: "Not open yet", text: "This session has not reached its opening time." },
  ended: { tone: "neutral", title: "Session ended", text: "Its check-in time is over." },
  finalized: { tone: "neutral", title: "Session finalized", text: "Attendance is closed." },
  unpublished: { tone: "warning", title: "Event not published", text: "Publish the event before check-in." },
};

/** Member photo (signed-in request) with an initials avatar when there is none or it fails to load. */
function Photo({ orgId, item, size }: { orgId: string; item: { userId: string; name: string; hasPhoto: boolean; photoVersion: number | null }; size: number }) {
  const path = `/org/${orgId}/members/${item.userId}/photo?v=${item.photoVersion ?? 0}`;
  // A failure is remembered per picture version, so a newly changed picture is tried again.
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const parts = item.name.split(" ");
  if (!item.hasPhoto || failedPath === path) return <Avatar first={parts[0] ?? ""} last={parts.slice(-1)[0] ?? ""} size={size} />;
  return <Image source={authedImage(path)} onError={() => setFailedPath(path)} accessibilityLabel={`Photo of ${item.name}`} style={{ width: size, height: size, borderRadius: size / 3.2, backgroundColor: colors.surfaceAlt }} />;
}

type Spot = ({ kind: "in"; item: LiveCheckIn } | { kind: "rejected"; item: LiveRejection }) & { shownAt: number };

/**
 * Live attendance for one session: the latest tap large (photo, name, number, status, exact time), totals from the
 * database, recent check-ins (one entry per saved record) and taps that were not recorded. Polls while the app is open.
 */
export default function LiveMonitor() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { org } = useOrg();
  const orgId = org?.id ?? "";
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [stale, setStale] = useState(false);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [now, setNow] = useState(Date.now());
  const seen = useRef<Set<string> | null>(null);
  const busy = useRef(false);
  const active = useRef(true);

  const poll = useCallback(async () => {
    if (busy.current || !orgId || !sessionId) return;
    busy.current = true;
    try {
      const next = await api.liveSession(orgId, sessionId);
      if (seen.current === null) {
        // What is already there when the screen opens is history, not a new tap.
        seen.current = new Set([...next.checkIns.map((c) => c.id), ...next.rejections.map((r) => r.id)]);
      } else {
        const fresh = [
          ...next.checkIns.filter((c) => !seen.current!.has(c.id)).map((item) => ({ kind: "in" as const, item })),
          ...next.rejections.filter((r) => !seen.current!.has(r.id)).map((item) => ({ kind: "rejected" as const, item })),
        ].sort((a, b) => b.item.at.localeCompare(a.item.at));
        for (const f of fresh) seen.current.add(f.item.id);
        if (fresh.length) {
          const at = Date.now();
          setSpots((prev) => [...fresh.map((f) => ({ ...f, shownAt: at })), ...prev].slice(0, MAX_SPOTS));
        }
      }
      setData(next); setError(null); setStale(false);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) setError(e);
      else setStale(true); // keep showing the last data, retry on the next tick
    } finally { busy.current = false; }
  }, [orgId, sessionId]);

  useEffect(() => {
    void poll();
    const t = setInterval(() => { setNow(Date.now()); if (active.current) void poll(); }, POLL_MS);
    const sub = AppState.addEventListener("change", (s) => { active.current = s === "active"; if (active.current) void poll(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [poll]);

  const feed = useMemo(() => (data ? [...new Map(data.checkIns.map((c) => [c.id, c])).values()].sort((a, b) => b.at.localeCompare(a.at)) : []), [data]);
  const visible = spots.filter((s) => now - s.shownAt < SPOTLIGHT_MS);
  const spotlight = visible.length === 1 ? visible[0] : null;

  if (!data) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader eyebrow={org?.name} title="Live attendance" back={() => router.back()} />
        {error ? <ErrorState error={error} onRetry={() => void poll()} /> : <Loading />}
      </View>
    );
  }
  const st = STATE[data.session.state];
  const t = data.totals;
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={data.event.title} title={data.session.label} subtitle={data.session.window} back={() => router.back()} />
      <Body tabs={false}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md, borderColor: st.tone === "success" ? colors.success : st.tone === "warning" ? colors.warning : colors.border, borderWidth: 1.5 }}>
          <Ionicons name={st.tone === "success" ? "radio" : "pause-circle-outline"} size={26} color={st.tone === "success" ? colors.success : st.tone === "warning" ? colors.warning : colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">{st.title}</Txt>
            <Txt variant="small">{st.text} Late after {data.session.lateAfter}.</Txt>
          </View>
        </Card>
        {stale ? (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: colors.dangerSoft }}>
            <Txt variant="small" color={colors.dangerInk} style={{ flex: 1 }}>Connection problem. Showing the last update; retrying…</Txt>
            <Button label="Retry" size="sm" variant="danger" onPress={() => void poll()} />
          </Card>
        ) : null}

        {/* the latest tap */}
        <Card style={{ paddingVertical: space.xl, minHeight: 230, justifyContent: "center" }}>
          <View accessibilityLiveRegion="polite" style={{ alignItems: "center", gap: space.sm }}>
          {spotlight?.kind === "in" ? (
            <>
              <Photo orgId={orgId} item={spotlight.item} size={112} />
              <View style={{ alignSelf: "center" }}><Badge label={spotlight.item.status === "LATE" ? "LATE" : "PRESENT"} tone={spotlight.item.status === "LATE" ? "warning" : "success"} /></View>
              <Txt variant="h2" align="center">{spotlight.item.name}</Txt>
              <Txt variant="body" align="center" color={colors.textSecondary}>{[spotlight.item.studentNumber, spotlight.item.program, spotlight.item.yearLevel ? `Year ${spotlight.item.yearLevel}` : null].filter(Boolean).join(" · ")}</Txt>
              <Txt variant="bodyStrong" align="center">{spotlight.item.time}</Txt>
            </>
          ) : visible.length > 1 ? (
            <View style={{ alignSelf: "stretch", gap: space.sm }}>
              <Txt variant="small">{visible.length} taps just now, newest first</Txt>
              {visible.map((s, i) => (
                <View key={s.item.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: s.kind === "rejected" ? colors.danger : i === 0 ? colors.primary : colors.border, backgroundColor: s.kind === "rejected" ? colors.dangerSoft : "transparent" }}>
                  {s.kind === "in" ? <Photo orgId={orgId} item={s.item} size={64} /> : <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.dangerSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name="close" size={30} color={colors.danger} /></View>}
                  <View style={{ flex: 1, gap: 2 }}>
                    {s.kind === "in" ? (
                      <>
                        <View style={{ alignSelf: "flex-start" }}><Badge label={s.item.status === "LATE" ? "LATE" : "PRESENT"} tone={s.item.status === "LATE" ? "warning" : "success"} /></View>
                        <Txt variant="bodyStrong" numberOfLines={1}>{s.item.name}</Txt>
                        <Txt variant="small" numberOfLines={1}>{[s.item.studentNumber, s.item.program, s.item.yearLevel ? `Year ${s.item.yearLevel}` : null].filter(Boolean).join(" · ")}</Txt>
                        <Txt variant="smallStrong">{s.item.time}</Txt>
                      </>
                    ) : (
                      <>
                        <Txt variant="bodyStrong" color={colors.dangerInk}>Not recorded</Txt>
                        <Txt variant="small">{s.item.message}</Txt>
                        <Txt variant="small">{[s.item.name, s.item.cardTail ? `Card ••••${s.item.cardTail}` : null, s.item.time].filter(Boolean).join(" · ")}</Txt>
                      </>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : spotlight?.kind === "rejected" ? (
            <>
              <View style={{ width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.dangerSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name="close" size={40} color={colors.danger} /></View>
              <Txt variant="h3" color={colors.dangerInk}>Not recorded</Txt>
              <Txt variant="body" align="center">{spotlight.item.message}</Txt>
              <Txt variant="small" align="center">{[spotlight.item.name, spotlight.item.cardTail ? `Card ••••${spotlight.item.cardTail}` : null, spotlight.item.device, spotlight.item.time].filter(Boolean).join(" · ")}</Txt>
            </>
          ) : (
            <>
              <Ionicons name="card-outline" size={44} color={colors.textMuted} />
              <Txt variant="bodyStrong">{data.session.state === "open" ? "Waiting for the next tap…" : "No check-ins are being taken"}</Txt>
              <Txt variant="small" align="center">Each successful tap shows here with the student's photo, number and time.</Txt>
            </>
          )}
          </View>
        </Card>

        <TileGrid>
          <StatTile icon="people" tone="primary" label="Checked in" value={String(t.present + t.late)} sub={t.expected ? `of ${t.expected} expected` : undefined} />
          <StatTile icon="checkmark-circle" tone="success" label="Present" value={String(t.present)} />
          <StatTile icon="time" tone="warning" label="Late" value={String(t.late)} />
          <StatTile icon="hourglass" tone="neutral" label="Not yet" value={String(Math.max(0, t.expected - t.present - t.late - t.excused))} />
        </TileGrid>

        <SectionTitle caption="Newest first">Recent check-ins</SectionTitle>
        {feed.length === 0 ? <Card><Txt variant="small">No check-ins yet.</Txt></Card> : (
          <ListGroup>
            {feed.map((c) => (
              <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
                <Photo orgId={orgId} item={c} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{c.name}</Txt>
                  <Txt variant="small" numberOfLines={1}>{[c.studentNumber, c.program, c.yearLevel ? `Year ${c.yearLevel}` : null].filter(Boolean).join(" · ")}</Txt>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Badge label={c.status === "LATE" ? "Late" : "Present"} tone={c.status === "LATE" ? "warning" : "success"} />
                  <Txt variant="small">{c.time}</Txt>
                </View>
              </View>
            ))}
          </ListGroup>
        )}

        {data.rejections.length ? (
          <>
            <SectionTitle caption="Last 30 minutes">Taps not recorded</SectionTitle>
            <ListGroup>
              {data.rejections.map((r) => (
                <View key={r.id} style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
                  <Txt variant="bodyStrong" color={colors.dangerInk}>{r.message}</Txt>
                  <Txt variant="small">{[r.name, r.cardTail ? `Card ••••${r.cardTail}` : null, r.device, r.time].filter(Boolean).join(" · ")}</Txt>
                </View>
              ))}
            </ListGroup>
          </>
        ) : null}
        <Txt variant="small" align="center">Updates every few seconds · Philippine time</Txt>
      </Body>
    </View>
  );
}
